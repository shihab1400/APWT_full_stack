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
  type BookingCheckout,
} from '@mindease/shared';
import { formatDhaka } from '../common/dhaka-time.js';
import type { RequestUser } from '../common/decorators.js';
import { publicDoctorWhere } from '../content/content.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { FieldCipher } from '../crypto/field-cipher.js';
import { PaymentsService } from '../payments/payments.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AvailabilityService } from '../scheduling/availability.service.js';
import { TierService } from '../subscriptions/tier.service.js';
import type { Prisma } from '../generated/prisma/client.js';

export const PATIENT_LINK = '/dashboard/appointments';
export const DOCTOR_LINK = '/doctor/appointments';

export const appointmentInclude = {
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
  patient: { select: { id: true, name: true, email: true } },
  payment: { select: { reference: true, status: true, amount: true } },
  review: { select: { rating: true } },
} as const;

type AppointmentRow = Prisma.AppointmentGetPayload<{ include: typeof appointmentInclude }>;

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
    private readonly payments: PaymentsService,
    private readonly cipher: FieldCipher,
  ) {}

  // ───────────── Patients ─────────────

  /**
   * Holds an open slot and starts payment of the doctor's fee (FR_8). Once paid,
   * it becomes a request the doctor must accept; unpaid holds are released.
   */
  async book(user: RequestUser, dto: BookAppointmentDto): Promise<BookingCheckout> {
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
      select: { id: true, userId: true, clinicAddress: true, fee: true, user: { select: { name: true } } },
    });
    if (!doctor) throw new NotFoundException('Doctor not found');
    if (dto.type === 'OFFLINE' && !doctor.clinicAddress) {
      throw new BadRequestException('This doctor only offers online sessions');
    }

    const startsAt = new Date(dto.startsAt);
    const { appointment, payment } = await this.prisma.$transaction(async (tx) => {
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

      const created = await tx.appointment.create({
        data: {
          patientId: user.id,
          doctorId: doctor.id,
          type: dto.type,
          status: 'PENDING_PAYMENT',
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          patientNote: this.cipher.encryptOptional(dto.note, 'Appointment.patientNote'),
          shareAssessments: dto.shareAssessments,
        },
      });
      // The amount is always the doctor's own fee; the client never sends one.
      const payment = await this.payments.createAppointmentPayment(tx, {
        userId: user.id,
        appointmentId: created.id,
        doctorId: doctor.id,
        amount: doctor.fee.toNumber(),
      });
      const appointment = await tx.appointment.findUniqueOrThrow({ where: { id: created.id }, include: appointmentInclude });
      return { appointment, payment };
    });

    // If the gateway can't be reached, this fails the payment and releases the slot.
    const checkout = await this.payments.checkout(payment.id, {
      reference: payment.reference,
      amount: payment.amount.toNumber(),
      productName: `Consultation with ${doctor.user.name}`,
      customer: { name: appointment.patient.name, email: appointment.patient.email },
    });
    return { ...checkout, appointment: this.item(appointment) };
  }

  /** The patient turns sharing of their assessment results with this doctor on or off. */
  async setSharing(userId: string, id: string, share: boolean): Promise<AppointmentItem> {
    const appt = await this.find(id, { patientId: userId });
    await this.prisma.appointment.update({ where: { id: appt.id }, data: { shareAssessments: share } });
    return this.item(await this.prisma.appointment.findUniqueOrThrow({ where: { id: appt.id }, include: appointmentInclude }));
  }

  async listForPatient(userId: string): Promise<AppointmentItem[]> {
    const rows = await this.prisma.appointment.findMany({
      where: { patientId: userId },
      include: appointmentInclude,
      orderBy: { startsAt: 'desc' },
      take: 200,
    });
    return rows.map((a) => this.item(a));
  }

  async cancelByPatient(userId: string, id: string, reason?: string): Promise<AppointmentItem> {
    const appt = await this.find(id, { patientId: userId });
    const updated = await this.transition(appt, ['REQUESTED', 'ACCEPTED'], {
      status: 'CANCELLED',
      cancelReason: reason || null,
      cancelledById: userId,
    }, { upcomingOnly: true });
    await this.payments.refundDueForAppointment(appt.id, 'You cancelled the appointment');
    await this.notifications.notify(appt.doctor.userId, {
      type: 'APPOINTMENT_CANCELLED',
      title: `${appt.patient.name} cancelled their appointment`,
      body: [describe(appt), reason].filter(Boolean).join('. '),
      email: true,
      link: DOCTOR_LINK,
    });
    return updated;
  }

  // ───────────── Doctors (FR_11) ─────────────

  async listForDoctor(doctorUserId: string): Promise<AppointmentItem[]> {
    const rows = await this.prisma.appointment.findMany({
      where: { doctor: { userId: doctorUserId }, status: { not: 'PENDING_PAYMENT' } },
      include: appointmentInclude,
      orderBy: { startsAt: 'asc' },
      take: 300,
    });
    return rows.map((a) => this.item(a));
  }

  async accept(doctorUserId: string, id: string): Promise<AppointmentItem> {
    const appt = await this.find(id, { doctor: { userId: doctorUserId } });
    const updated = await this.transition(appt, ['REQUESTED'], { status: 'ACCEPTED' }, { upcomingOnly: true });
    await this.notifications.notify(appt.patientId, {
      type: 'APPOINTMENT_ACCEPTED',
      title: `${appt.doctor.user.name} confirmed your appointment`,
      body: describe(appt),
      email: true,
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
    await this.payments.refundDueForAppointment(appt.id, 'The doctor declined the request');
    await this.notifications.notify(appt.patientId, {
      type: 'APPOINTMENT_DECLINED',
      title: `${appt.doctor.user.name} declined your request`,
      body: `${describe(appt)}. Reason: ${reason}`,
      email: true,
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
    await this.payments.refundDueForAppointment(appt.id, 'The doctor cancelled the appointment');
    await this.notifications.notify(appt.patientId, {
      type: 'APPOINTMENT_CANCELLED',
      title: `${appt.doctor.user.name} cancelled your appointment`,
      body: `${describe(appt)}. Reason: ${reason}`,
      email: true,
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
      include: appointmentInclude,
      orderBy: { startsAt: 'desc' },
      take: 500,
    });
    return rows.map((a) => this.item(a));
  }

  // ───────────── Helpers ─────────────

  /** API shape with the patient's note decrypted. */
  private item(a: AppointmentRow): AppointmentItem {
    return { ...toItem(a), patientNote: this.cipher.decryptOptional(a.patientNote, 'Appointment.patientNote') };
  }

  private async find(id: string, owner: Prisma.AppointmentWhereInput): Promise<AppointmentRow> {
    // Someone else's appointment looks the same as a missing one.
    const appt = await this.prisma.appointment.findFirst({ where: { id, ...owner }, include: appointmentInclude });
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
    return this.item(await this.prisma.appointment.findUniqueOrThrow({ where: { id: appt.id }, include: appointmentInclude }));
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
    shareAssessments: a.shareAssessments,
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
    payment: a.payment
      ? { reference: a.payment.reference, status: a.payment.status, amount: a.payment.amount.toNumber() }
      : null,
    review: a.review,
  };
}
