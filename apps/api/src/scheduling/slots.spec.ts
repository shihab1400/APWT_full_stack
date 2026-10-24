import { bookableSlots, bookingRange, weeklySlots } from './slots.js';

const iso = (d: Date) => d.toISOString();
// Monday 10:00–12:00 Dhaka = 04:00–06:00 UTC.
const MONDAY_10_TO_12 = { dayOfWeek: 1, startMinute: 600, endMinute: 720 };
// Sunday 26 Oct 2026, 09:00 Dhaka.
const NOW = new Date('2026-10-26T03:00:00Z');

describe('weeklySlots', () => {
  it('splits a window into session-length slots in Dhaka time', () => {
    const slots = weeklySlots(
      [MONDAY_10_TO_12],
      new Date('2026-10-25T18:00:00Z'),
      new Date('2026-10-26T18:00:00Z'),
    );
    expect(slots.map((s) => [iso(s.startsAt), iso(s.endsAt)])).toEqual([
      ['2026-10-26T04:00:00.000Z', '2026-10-26T05:00:00.000Z'],
      ['2026-10-26T05:00:00.000Z', '2026-10-26T06:00:00.000Z'],
    ]);
  });

  it('drops a trailing part shorter than a session', () => {
    const slots = weeklySlots(
      [{ dayOfWeek: 1, startMinute: 600, endMinute: 750 }],
      new Date('2026-10-25T18:00:00Z'),
      new Date('2026-10-26T18:00:00Z'),
    );
    expect(slots).toHaveLength(2);
  });

  it('uses the Dhaka weekday, not the UTC one', () => {
    // Monday 01:00 Dhaka is still Sunday in UTC.
    const slots = weeklySlots(
      [{ dayOfWeek: 1, startMinute: 60, endMinute: 120 }],
      new Date('2026-10-25T18:00:00Z'),
      new Date('2026-10-26T18:00:00Z'),
    );
    expect(slots.map((s) => iso(s.startsAt))).toEqual(['2026-10-25T19:00:00.000Z']);
  });

  it('repeats every week', () => {
    const slots = weeklySlots([MONDAY_10_TO_12], NOW, new Date('2026-11-09T00:00:00Z'));
    expect(slots).toHaveLength(4);
  });
});

describe('bookableSlots', () => {
  it('covers 14 Dhaka days starting today', () => {
    const { to } = bookingRange(NOW);
    expect(iso(to)).toBe('2026-11-08T18:00:00.000Z');
    const slots = bookableSlots({ windows: [MONDAY_10_TO_12], blocks: [], taken: [], now: NOW });
    expect(slots.map((s) => iso(s.startsAt))).toEqual([
      '2026-10-26T04:00:00.000Z',
      '2026-10-26T05:00:00.000Z',
      '2026-11-02T04:00:00.000Z',
      '2026-11-02T05:00:00.000Z',
    ]);
  });

  it('removes blocked and taken slots', () => {
    const slots = bookableSlots({
      windows: [MONDAY_10_TO_12],
      blocks: [{ startsAt: new Date('2026-10-26T04:30:00Z'), endsAt: new Date('2026-10-26T04:45:00Z') }],
      taken: [{ startsAt: new Date('2026-11-02T05:00:00Z'), endsAt: new Date('2026-11-02T06:00:00Z') }],
      now: NOW,
    });
    expect(slots.map((s) => iso(s.startsAt))).toEqual([
      '2026-10-26T05:00:00.000Z',
      '2026-11-02T04:00:00.000Z',
    ]);
  });

  it('needs at least an hour of notice', () => {
    // Monday 09:30 Dhaka: the 10:00 slot is too soon, 11:00 is fine.
    const slots = bookableSlots({
      windows: [MONDAY_10_TO_12],
      blocks: [],
      taken: [],
      now: new Date('2026-10-26T03:30:00Z'),
    });
    expect(iso(slots[0].startsAt)).toBe('2026-10-26T05:00:00.000Z');
  });
});
