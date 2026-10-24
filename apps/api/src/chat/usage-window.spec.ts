import { dhakaDay } from './usage-window.js';

describe('dhakaDay', () => {
  it('starts at 18:00 UTC the previous day (midnight in Dhaka)', () => {
    const { start, end } = dhakaDay(new Date('2026-10-24T10:00:00Z'));
    expect(start.toISOString()).toBe('2026-10-23T18:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-24T18:00:00.000Z');
  });

  it('rolls over at Dhaka midnight, not UTC midnight', () => {
    expect(dhakaDay(new Date('2026-10-24T17:59:59Z')).start.toISOString()).toBe(
      '2026-10-23T18:00:00.000Z',
    );
    expect(dhakaDay(new Date('2026-10-24T18:00:00Z')).start.toISOString()).toBe(
      '2026-10-24T18:00:00.000Z',
    );
  });
});
