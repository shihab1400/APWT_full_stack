/** Bangladesh Standard Time, UTC+6 with no daylight saving. */
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Start and end of the current calendar day in Dhaka, as UTC instants. */
export function dhakaDay(now = new Date()): { start: Date; end: Date } {
  const local = now.getTime() + DHAKA_OFFSET_MS;
  const start = Math.floor(local / DAY_MS) * DAY_MS - DHAKA_OFFSET_MS;
  return { start: new Date(start), end: new Date(start + DAY_MS) };
}
