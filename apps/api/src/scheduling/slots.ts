import {
  BOOKING_WINDOW_DAYS,
  MIN_BOOKING_LEAD_MINUTES,
  SESSION_MINUTES,
  type WeeklyWindow,
} from '@mindease/shared';
import { DAY_MS, atDhakaMinute, dhakaDay, dhakaWeekday } from '../common/dhaka-time.js';

export interface Interval {
  startsAt: Date;
  endsAt: Date;
}

export const overlaps = (a: Interval, b: Interval) => a.startsAt < b.endsAt && b.startsAt < a.endsAt;

/** Every session-length slot the weekly windows produce with a start in [from, to). */
export function weeklySlots(windows: WeeklyWindow[], from: Date, to: Date): Interval[] {
  const slots: Interval[] = [];
  const sorted = [...windows].sort((a, b) => a.startMinute - b.startMinute);
  for (let day = dhakaDay(from).start; day < to; day = new Date(day.getTime() + DAY_MS)) {
    const weekday = dhakaWeekday(day);
    for (const w of sorted) {
      if (w.dayOfWeek !== weekday) continue;
      for (let m = w.startMinute; m + SESSION_MINUTES <= w.endMinute; m += SESSION_MINUTES) {
        const startsAt = atDhakaMinute(day, m);
        if (startsAt >= from && startsAt < to) {
          slots.push({ startsAt, endsAt: atDhakaMinute(day, m + SESSION_MINUTES) });
        }
      }
    }
  }
  return slots;
}

/** The period patients may book in: from the lead time until the end of the booking window. */
export function bookingRange(now: Date): { from: Date; to: Date } {
  return {
    from: new Date(now.getTime() + MIN_BOOKING_LEAD_MINUTES * 60_000),
    to: new Date(dhakaDay(now).start.getTime() + BOOKING_WINDOW_DAYS * DAY_MS),
  };
}

/** Open slots: inside the weekly hours and booking range, not blocked, not already taken. */
export function bookableSlots(input: {
  windows: WeeklyWindow[];
  blocks: Interval[];
  taken: Interval[];
  now: Date;
}): Interval[] {
  const { from, to } = bookingRange(input.now);
  const busy = [...input.blocks, ...input.taken];
  return weeklySlots(input.windows, from, to).filter((s) => !busy.some((b) => overlaps(s, b)));
}
