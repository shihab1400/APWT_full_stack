import { chatWindow } from './chat-window.js';

const startsAt = new Date('2026-10-26T05:00:00Z');
const endsAt = new Date('2026-10-26T06:00:00Z');
const at = (iso: string, status = 'ACCEPTED') => chatWindow({ startsAt, endsAt, status }, new Date(iso)).window;

describe('chatWindow', () => {
  it('opens 15 minutes before the start', () => {
    expect(at('2026-10-26T04:44:59Z')).toBe('UPCOMING');
    expect(at('2026-10-26T04:45:00Z')).toBe('OPEN');
  });

  it('closes an hour after the scheduled end', () => {
    expect(at('2026-10-26T06:59:59Z')).toBe('OPEN');
    expect(at('2026-10-26T07:00:00Z')).toBe('CLOSED');
  });

  it('is closed unless the appointment is confirmed', () => {
    expect(at('2026-10-26T05:30:00Z', 'COMPLETED')).toBe('CLOSED');
    expect(at('2026-10-26T05:30:00Z', 'CANCELLED')).toBe('CLOSED');
  });

  it('reports the open and close times', () => {
    const w = chatWindow({ startsAt, endsAt, status: 'ACCEPTED' });
    expect(w.opensAt.toISOString()).toBe('2026-10-26T04:45:00.000Z');
    expect(w.closesAt.toISOString()).toBe('2026-10-26T07:00:00.000Z');
  });
});
