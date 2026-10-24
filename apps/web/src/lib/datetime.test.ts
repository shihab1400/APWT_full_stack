import { describe, expect, it } from "vitest";
import {
  dhakaDateKey,
  dhakaInstant,
  formatDateTime,
  groupByDay,
  minuteToTime,
  timeAgo,
  timeToMinute,
} from "./datetime";

describe("datetime (Dhaka)", () => {
  it("formats in Bangladesh time regardless of the device", () => {
    expect(formatDateTime("2026-10-26T05:00:00Z")).toBe("Mon 26 Oct, 11:00 am");
  });

  it("uses the Dhaka calendar date", () => {
    // 19:00 UTC on the 25th is 01:00 on the 26th in Dhaka.
    expect(dhakaDateKey("2026-10-25T19:00:00Z")).toBe("2026-10-26");
  });

  it("round-trips dates and times", () => {
    expect(dhakaInstant("2026-10-28", "14:00")).toBe("2026-10-28T08:00:00.000Z");
    expect(minuteToTime(630)).toBe("10:30");
    expect(timeToMinute("10:30")).toBe(630);
  });

  it("groups by day in order", () => {
    const groups = groupByDay(
      ["2026-10-26T04:00:00Z", "2026-10-26T05:00:00Z", "2026-10-27T04:00:00Z"],
      (s) => s,
    );
    expect(groups.map(([day, items]) => [day, items.length])).toEqual([
      ["2026-10-26", 2],
      ["2026-10-27", 1],
    ]);
  });

  it("describes recent times", () => {
    const now = new Date("2026-10-26T05:00:00Z").getTime();
    expect(timeAgo("2026-10-26T04:59:40Z", now)).toBe("just now");
    expect(timeAgo("2026-10-26T04:30:00Z", now)).toBe("30 min ago");
    expect(timeAgo("2026-10-26T02:00:00Z", now)).toBe("3 h ago");
  });
});
