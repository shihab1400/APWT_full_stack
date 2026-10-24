import { z } from 'zod';

/** All schedules are in Bangladesh time (UTC+6, no daylight saving). */
export const BD_TIME_ZONE = 'Asia/Dhaka';

export const SESSION_MINUTES = 60;
/** Weekly windows start and end on this grid, e.g. 10:00 or 10:30. */
export const SCHEDULE_STEP_MINUTES = 30;
/** How far ahead patients can book. */
export const BOOKING_WINDOW_DAYS = 14;
/** Slots starting sooner than this cannot be booked. */
export const MIN_BOOKING_LEAD_MINUTES = 60;
export const REMINDER_MINUTES_BEFORE = 15;

export const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** Error code (HTTP 409) for a slot that is outside hours, blocked or taken. */
export const SLOT_UNAVAILABLE = 'SLOT_UNAVAILABLE';
export const SLOT_UNAVAILABLE_MESSAGE = 'This time slot is not available';
/** Error code (HTTP 403) when a free user tries to book. */
export const PREMIUM_REQUIRED = 'PREMIUM_REQUIRED';

const minuteOfDay = z
  .int()
  .min(0)
  .max(24 * 60)
  .refine((m) => m % SCHEDULE_STEP_MINUTES === 0, {
    error: `Times must be on a ${SCHEDULE_STEP_MINUTES}-minute boundary`,
  });

export const weeklyWindowSchema = z
  .object({
    dayOfWeek: z.int().min(0).max(6),
    startMinute: minuteOfDay,
    endMinute: minuteOfDay,
  })
  .refine((w) => w.endMinute - w.startMinute >= SESSION_MINUTES, {
    error: `Each window must be at least ${SESSION_MINUTES} minutes long`,
    path: ['endMinute'],
  });
export type WeeklyWindow = z.infer<typeof weeklyWindowSchema>;

/** The doctor's full weekly schedule; saving replaces the previous one. */
export const weeklyAvailabilitySchema = z.object({
  windows: z
    .array(weeklyWindowSchema)
    .max(50)
    .superRefine((windows, ctx) => {
      const sorted = [...windows].sort(
        (a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute,
      );
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const cur = sorted[i];
        if (prev.dayOfWeek === cur.dayOfWeek && cur.startMinute < prev.endMinute) {
          ctx.addIssue({
            code: 'custom',
            message: `${DAY_NAMES[cur.dayOfWeek]} has overlapping hours`,
          });
          return;
        }
      }
    }),
});
export type WeeklyAvailabilityDto = z.infer<typeof weeklyAvailabilitySchema>;

const isoInstant = z.iso.datetime({ offset: true, error: 'Enter a valid date and time' });

export const createBlockSchema = z
  .object({
    startsAt: isoInstant,
    endsAt: isoInstant,
    reason: z.string().trim().max(200).optional(),
  })
  .refine((b) => new Date(b.endsAt) > new Date(b.startsAt), {
    error: 'The end must be after the start',
    path: ['endsAt'],
  })
  .refine((b) => new Date(b.endsAt).getTime() - new Date(b.startsAt).getTime() <= 31 * 86_400_000, {
    error: 'Block at most 31 days at a time',
    path: ['endsAt'],
  });
export type CreateBlockDto = z.infer<typeof createBlockSchema>;

export interface AvailabilityBlockItem {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
}

export interface BookableSlot {
  startsAt: string;
  endsAt: string;
}

/** Public: open slots for one doctor over the booking window. */
export interface DoctorSlots {
  doctorId: string;
  /** In-person sessions are offered only when the doctor has a clinic address. */
  clinicAddress: string | null;
  slots: BookableSlot[];
}

/** One session-length slot on the doctor's own calendar. */
export interface ScheduleSlot extends BookableSlot {
  state: 'OPEN' | 'REQUESTED' | 'BOOKED' | 'BLOCKED';
  blockId?: string;
  appointmentId?: string;
}

export interface DoctorSchedule {
  windows: WeeklyWindow[];
  blocks: AvailabilityBlockItem[];
  /** Upcoming slots from the weekly windows, with their current state. */
  slots: ScheduleSlot[];
}
