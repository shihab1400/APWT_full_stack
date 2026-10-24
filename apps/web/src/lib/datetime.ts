import { BD_TIME_ZONE } from "@mindease/shared";

// Every schedule is in Bangladesh time, whatever the viewer's device is set to.
const fmt = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: BD_TIME_ZONE, ...options });

const dayFmt = fmt({ weekday: "short", day: "numeric", month: "short" });
const longDayFmt = fmt({ weekday: "long", day: "numeric", month: "long" });
const timeFmt = fmt({ hour: "numeric", minute: "2-digit", hour12: true });
const keyFmt = fmt({ year: "numeric", month: "2-digit", day: "2-digit" });

/** "Mon 27 Oct" */
export const formatDay = (iso: string) => dayFmt.format(new Date(iso));
/** "Monday 27 October" */
export const formatLongDay = (iso: string) => longDayFmt.format(new Date(iso));
/** "11:00 am" */
export const formatTime = (iso: string) => timeFmt.format(new Date(iso));
/** "Mon 27 Oct, 11:00 am" */
export const formatDateTime = (iso: string) => `${formatDay(iso)}, ${formatTime(iso)}`;

/** Dhaka calendar date "2026-10-27", for grouping and <input type="date">. */
export function dhakaDateKey(iso: string): string {
  const [d, m, y] = keyFmt.format(new Date(iso)).split("/");
  return `${y}-${m}-${d}`;
}

/** "10:30" for a minute-of-day value. */
export function minuteToTime(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

/** Minute-of-day from "10:30". */
export function timeToMinute(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

/** ISO instant for a Dhaka date ("2026-10-27") and time ("14:00"). */
export const dhakaInstant = (date: string, time: string) =>
  new Date(`${date}T${time}:00+06:00`).toISOString();

/** Groups items by Dhaka calendar day, keeping their order. */
export function groupByDay<T>(items: T[], isoOf: (item: T) => string): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = dhakaDateKey(isoOf(item));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  return [...groups.entries()];
}

/** "just now", "5 min ago", "3 h ago", else the date. */
export function timeAgo(iso: string, now = Date.now()): string {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return formatDay(iso);
}
