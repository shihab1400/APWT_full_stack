/** Bangladesh Standard Time, UTC+6 with no daylight saving. */
export const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60_000;

/** Start and end of the current calendar day in Dhaka, as UTC instants. */
export function dhakaDay(now = new Date()): { start: Date; end: Date } {
  const local = now.getTime() + DHAKA_OFFSET_MS;
  const start = Math.floor(local / DAY_MS) * DAY_MS - DHAKA_OFFSET_MS;
  return { start: new Date(start), end: new Date(start + DAY_MS) };
}

/** Day of week (0 = Sunday) of the Dhaka calendar day that `instant` falls on. */
export function dhakaWeekday(instant: Date): number {
  return new Date(instant.getTime() + DHAKA_OFFSET_MS).getUTCDay();
}

/** The instant at `minute` minutes past midnight on the Dhaka day starting at `dayStart`. */
export function atDhakaMinute(dayStart: Date, minute: number): Date {
  return new Date(dayStart.getTime() + minute * MINUTE_MS);
}

const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Dhaka',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/** e.g. "Mon 26 Oct, 11:00 am", for notification text. */
export function formatDhaka(instant: Date): string {
  return formatter.format(instant);
}
