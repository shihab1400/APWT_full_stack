import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ACTIVE_APPOINTMENT_STATUSES,
  APPOINTMENT_TYPE_LABEL,
  PREMIUM_REQUIRED,
  type AppointmentItem,
  type AppointmentStatus,
  type AppointmentType,
  type BookAppointmentDto,
} from '@mindease/shared';
import { formatDhaka } from '../common/dhaka-time.js';
import type { RequestUser } from '../common/decorators.js';
import { publicDoctorWhere } from '../content/content.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AvailabilityService } from '../scheduling/availability.service.js';
import { TierService } from '../subscriptions/tier.service.js';
import type { Prisma } from '../generated/prisma/client.js';

export const PATIENT_LINK = '/dashboard/appointments';
export const DOCTOR_LINK = '/doctor/appointments';

const include = {
  doctor: {
    select: {
      id: true,
      userId: true,
      specialization: true,
      fee: true,
      clinicAddress: true,
      user: { select: { name: true } },
    },
  },
  patient: { select: { id: true, name: true } },
} as const;

type AppointmentRow = Prisma.AppointmentGetPayload<{ include: typeof include }>;

export interface AdminAppointmentFilters {
  status?: AppointmentStatus;
  type?: AppointmentType;
  from?: Date;
  to?: Date;
}

const describe = (a: { type: AppointmentType; startsAt: Date }) =>
  `${APPOINTMENT_TYPE_LABEL[a.type]} · ${formatDhaka(a.startsAt)}`;

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly tiers: TierService,
    private readonly notifications: NotificationsService,
  ) {}

  // ───────────── Patients ─────────────

  /** Books an open slot as a request the doctor must accept (FR_8). */
  async book(user: RequestUser, dto: BookAppointmentDto): Promise<AppointmentItem> {
    // Checked against the database, not the token, so an upgrade counts immediately.
    if ((await this.tiers.tierOf(user)) !== 'PAID') {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'Booking a doctor is part of the Premium plan',
        code: PREMIUM_REQUIRED,
      });
    }
    const doctor = await this.prisma.doctorProfile.findFirst({
      where: { id: dto.doctorId, ...publicDoctorWhere },
      select: { id: true, userId: true, clinicAddress: true },
    });
    if (!doctor) throw new NotFoundException('Doctor not found');
    if (dto.type === 'OFFLINE' && !doctor.clinicAddress) {
      throw new BadRequestException('This doctor only offers online sessions');
    }

    const startsAt = new Date(dto.startsAt);
    const appointment = await this.prisma.$transaction(async (tx) => {
      // Serialises bookings per doctor so two patients can't take the same slot.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${doctor.id}))`;
      const slot = await this.availability.assertBookable(tx, doctor.id, startsAt);

      const clash = await tx.appointment.count({
        where: {
          patientId: user.id,
          status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
          startsAt: { lt: slot.endsAt },
          endsAt: { gt: slot.startsAt },
        },
      });
      if (clash) throw new ConflictException('You already have an appointment at this time');

      return tx.appointment.create({
        data: {
          patientId: user.id,
          doctorId: doctor.id,
          type: dto.type,
          // Payment is added in front of this step in phase 5.
          status: 'REQUESTED',
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          patientNote: dto.note || null,
        },
        include,
      });
    });

    // Lets admins see that a high-risk user followed the advice to see a doctor (FR #20).
    await this.prisma.riskAlert.updateMany({
      where: { userId: user.id, bookedDoctor: false },
      data: { bookedDoctor: true },
    });

    await this.notifications.notify(doctor.userId, {
      type: 'APPOINTMENT_REQUESTED',
      title: `New booking request from ${appointment.patient.name}`,
      body: describe(appointment),
      link: DOCTOR_LINK,
    });
    await this.notifications.notify(user.id, {
      type: 'APPOINTMENT_REQUESTED',
      title: `Request sent to ${appointment.doctor.user.name}`,
      body: `${describe(appointment)}. You'll be notified when the doctor responds.`,
      link: PATIENT_LINK,
    });
    return toItem(appointment);
  }

  async listForPatient(userId: string): Promise<AppointmentItem[]> {
    const rows = await this.prisma.appointment.findMany({
      where: { patientId: userId },
      include,
      orderBy: { startsAt: 'desc' },
      take: 200,
    });
    return rows.map(toItem);
  }

  async cancelByPatient(userId: string, id: string, reason?: string): Promise<AppointmentItem> {
    const appt = await this.find(id, { patientId: userId });
    const updated = await this.transition(appt, ['REQUESTED', 'ACCEPTED'], {
      status: 'CANCELLED',
      cancelReason: reason || null,
      cancelledById: userId,
    }, { upcomingOnly: true });
    await this.notifications.notify(appt.doctor.userId, {
      type: 'APPOINTMENT_CANCELLED',
      title: `${appt.patient.name} cancelled their appointment`,
      body: [describe(appt), reason].filter(Boolean).join('. '),
      link: DOCTOR_LINK,
    });
    return updated;
  }

  // ───────────── Doctors (FR_11) ─────────────

  async listForDoctor(doctorUserId: string): Promise<AppointmentItem[]> {
    const rows = await this.prisma.appointment.findMany({
      where: { doctor: { userId: doctorUserId }, status: { not: 'PENDING_PAYMENT' } },
      include,
      orderBy: { startsAt: 'asc' },
      take: 300,
    });
    return rows.map(toItem);
  }

  async accept(doctorUserId: string, id: string): Promise<AppointmentItem> {
    const appt = await this.find(id, { doctor: { userId: doctorUserId } });
    const updated = await this.transition(appt, ['REQUESTED'], { status: 'ACCEPTED' }, { upcomingOnly: true });
    await this.notifications.notify(appt.patientId, {
      type: 'APPOINTMENT_ACCEPTED',
      title: `${appt.doctor.user.name} confirmed your appointment`,
      body: describe(appt),
      link: PATIENT_LINK,
    });
    return updated;
  }

  async decline(doctorUserId: string, id: string, reason: string): Promise<AppointmentItem> {
    const appt = await this.find(id, { doctor: { userId: doctorUserId } });
    const updated = await this.transition(appt, ['REQUESTED'], {
      status: 'DECLINED',
      declineReason: reason,
    });
    await this.notifications.notify(appt.patientId, {
      type: 'APPOINTMENT_DECLINED',
      title: `${appt.doctor.user.name} declined your request`,
      body: `${describe(appt)}. Reason: ${reason}`,
      link: PATIENT_LINK,
    });
    return updated;
  }

  async cancelByDoctor(doctorUserId: string, id: string, reason?: string): Promise<AppointmentItem> {
    if (!reason || reason.length < 3) {
      throw new BadRequestException('Tell the patient why the appointment is cancelled');
    }
    const appt = await this.find(id, { doctor: { userId: doctorUserId } });
    const updated = await this.transition(appt, ['ACCEPTED'], {
      status: 'CANCELLED',
      cancelReason: reason,
      cancelledById: doctorUserId,
    }, { upcomingOnly: true });
    await this.notifications.notify(appt.patientId, {
      type: 'APPOINTMENT_CANCELLED',
      title: `${appt.doctor.user.name} cancelled your appointment`,
      body: `${describe(appt)}. Reason: ${reason}`,
      link: PATIENT_LINK,
    });
    return updated;
  }

  async complete(doctorUserId: string, id: string): Promise<AppointmentItem> {
    const appt = await this.find(id, { doctor: { userId: doctorUserId } });
    if (appt.startsAt > new Date()) {
      throw new ConflictException('A session can be marked completed once it has started');
    }
    return this.transition(appt, ['ACCEPTED'], { status: 'COMPLETED' });
  }

  // ───────────── Admin (FR #21) ─────────────

  async adminList(f: AdminAppointmentFilters): Promise<AppointmentItem[]> {
    const rows = await this.prisma.appointment.findMany({
      where: {
        status: f.status,
        type: f.type,
        startsAt: { gte: f.from, lt: f.to },
      },
      include,
      orderBy: { startsAt: 'desc' },
      take: 500,
    });
    return rows.map(toItem);
  }

  // ───────────── Helpers ─────────────

  private async find(id: string, owner: Prisma.AppointmentWhereInput): Promise<AppointmentRow> {
    // Someone else's appointment looks the same as a missing one.
    const appt = await this.prisma.appointment.findFirst({ where: { id, ...owner }, include });
    if (!appt) throw new NotFoundException('Appointment not found');
    return appt;
  }

  /** Changes status only if it is still one of `from`, so concurrent actions can't both win. */
  private async transition(
    appt: AppointmentRow,
    from: AppointmentStatus[],
    data: Prisma.AppointmentUpdateManyMutationInput,
    opts: { upcomingOnly?: boolean } = {},
  ): Promise<AppointmentItem> {
    if (opts.upcomingOnly && appt.startsAt <= new Date()) {
      throw new ConflictException('This appointment has already started');
    }
    const { count } = await this.prisma.appointment.updateMany({
      where: { id: appt.id, status: { in: from } },
      data,
    });
    if (!count) {
      throw new ConflictException(`This appointment is ${appt.status.toLowerCase()} and can't be changed`);
    }
    return toItem(await this.prisma.appointment.findUniqueOrThrow({ where: { id: appt.id }, include }));
  }
}

export function toItem(a: AppointmentRow): AppointmentItem {
  return {
    id: a.id,
    type: a.type,
    status: a.status,
    startsAt: a.startsAt.toISOString(),
    endsAt: a.endsAt.toISOString(),
    patientNote: a.patientNote,
    declineReason: a.declineReason,
    cancelReason: a.cancelReason,
    cancelledBy:
      a.status !== 'CANCELLED'
        ? null
        : !a.cancelledById
          ? 'SYSTEM'
          : a.cancelledById === a.patientId
            ? 'PATIENT'
            : 'DOCTOR',
    createdAt: a.createdAt.toISOString(),
    doctor: {
      id: a.doctor.id,
      name: a.doctor.user.name,
      specialization: a.doctor.specialization,
      fee: a.doctor.fee.toNumber(),
      clinicAddress: a.doctor.clinicAddress,
    },
    patient: { id: a.patient.id, name: a.patient.name },
  };
}
