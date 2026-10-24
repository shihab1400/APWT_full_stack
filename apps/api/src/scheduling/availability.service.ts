import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ACTIVE_APPOINTMENT_STATUSES,
  SLOT_UNAVAILABLE,
  SLOT_UNAVAILABLE_MESSAGE,
  type CreateBlockDto,
  type DoctorSchedule,
  type DoctorSlots,
  type ScheduleSlot,
  type WeeklyWindow,
} from '@mindease/shared';
import { publicDoctorWhere } from '../content/content.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { bookableSlots, bookingRange, overlaps, weeklySlots, type Interval } from './slots.js';

type Db = PrismaService | Prisma.TransactionClient;

const windowSelect = { dayOfWeek: true, startMinute: true, endMinute: true } as const;

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  // ───────────── Doctor's own schedule (FR_10) ─────────────

  async schedule(userId: string, now = new Date()): Promise<DoctorSchedule> {
    const doctorId = await this.doctorIdOf(userId);
    const { to } = bookingRange(now);
    const [windows, blocks, appointments] = await Promise.all([
      this.windows(this.prisma, doctorId),
      this.prisma.availabilityBlock.findMany({
        where: { doctorId, endsAt: { gt: now } },
        orderBy: { startsAt: 'asc' },
      }),
      this.activeAppointments(this.prisma, doctorId, now, to),
    ]);

    const slots: ScheduleSlot[] = weeklySlots(windows, now, to).map((s) => {
      const base = { startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString() };
      const appt = appointments.find((a) => overlaps(s, a));
      if (appt) {
        return {
          ...base,
          state: appt.status === 'ACCEPTED' ? 'BOOKED' : 'REQUESTED',
          appointmentId: appt.id,
        };
      }
      const block = blocks.find((b) => overlaps(s, b));
      return block ? { ...base, state: 'BLOCKED', blockId: block.id } : { ...base, state: 'OPEN' };
    });

    return {
      windows,
      blocks: blocks.map((b) => ({
        id: b.id,
        startsAt: b.startsAt.toISOString(),
        endsAt: b.endsAt.toISOString(),
        reason: b.reason,
      })),
      slots,
    };
  }

  /** Replaces the weekly hours. Existing appointments are kept. */
  async setWeekly(userId: string, windows: WeeklyWindow[]) {
    const doctorId = await this.doctorIdOf(userId);
    await this.prisma.$transaction([
      this.prisma.availabilitySlot.deleteMany({ where: { doctorId } }),
      this.prisma.availabilitySlot.createMany({ data: windows.map((w) => ({ ...w, doctorId })) }),
    ]);
    return this.schedule(userId);
  }

  async addBlock(userId: string, dto: CreateBlockDto) {
    const doctorId = await this.doctorIdOf(userId);
    const block = { startsAt: new Date(dto.startsAt), endsAt: new Date(dto.endsAt) };
    if (block.endsAt <= new Date()) throw new ConflictException('That time has already passed');

    const clash = await this.prisma.appointment.count({
      where: {
        doctorId,
        status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
        startsAt: { lt: block.endsAt },
        endsAt: { gt: block.startsAt },
      },
    });
    if (clash) {
      throw new ConflictException(
        'You have appointments in this period. Decline or cancel them first.',
      );
    }
    await this.prisma.availabilityBlock.create({
      data: { doctorId, ...block, reason: dto.reason || null },
    });
    return this.schedule(userId);
  }

  async removeBlock(userId: string, blockId: string) {
    const doctorId = await this.doctorIdOf(userId);
    const { count } = await this.prisma.availabilityBlock.deleteMany({
      where: { id: blockId, doctorId },
    });
    if (!count) throw new NotFoundException('Blocked period not found');
    return this.schedule(userId);
  }

  // ───────────── Patients ─────────────

  async publicSlots(doctorId: string, now = new Date()): Promise<DoctorSlots> {
    const doctor = await this.prisma.doctorProfile.findFirst({
      where: { id: doctorId, ...publicDoctorWhere },
      select: { id: true, clinicAddress: true },
    });
    if (!doctor) throw new NotFoundException('Doctor not found');
    const slots = await this.openSlots(this.prisma, doctorId, now);
    return {
      doctorId,
      clinicAddress: doctor.clinicAddress,
      slots: slots.map((s) => ({ startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString() })),
    };
  }

  /**
   * Returns the slot starting at `startsAt` if it can be booked right now, or
   * throws 409 SLOT_UNAVAILABLE. Run inside the booking transaction.
   */
  async assertBookable(db: Db, doctorId: string, startsAt: Date, now = new Date()): Promise<Interval> {
    const slot = (await this.openSlots(db, doctorId, now)).find(
      (s) => s.startsAt.getTime() === startsAt.getTime(),
    );
    if (!slot) throw new ConflictException({ statusCode: 409, message: SLOT_UNAVAILABLE_MESSAGE, code: SLOT_UNAVAILABLE });
    return slot;
  }

  private async openSlots(db: Db, doctorId: string, now: Date): Promise<Interval[]> {
    const { from, to } = bookingRange(now);
    const [windows, blocks, taken] = await Promise.all([
      this.windows(db, doctorId),
      db.availabilityBlock.findMany({
        where: { doctorId, startsAt: { lt: to }, endsAt: { gt: from } },
        select: { startsAt: true, endsAt: true },
      }),
      this.activeAppointments(db, doctorId, from, to),
    ]);
    return bookableSlots({ windows, blocks, taken, now });
  }

  private windows(db: Db, doctorId: string): Promise<WeeklyWindow[]> {
    return db.availabilitySlot.findMany({
      where: { doctorId },
      select: windowSelect,
      orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
    });
  }

  private activeAppointments(db: Db, doctorId: string, from: Date, to: Date) {
    return db.appointment.findMany({
      where: {
        doctorId,
        status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
        startsAt: { lt: to },
        endsAt: { gt: from },
      },
      select: { id: true, status: true, startsAt: true, endsAt: true },
    });
  }

  private async doctorIdOf(userId: string): Promise<string> {
    const profile = await this.prisma.doctorProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Doctor profile not found');
    return profile.id;
  }
}
