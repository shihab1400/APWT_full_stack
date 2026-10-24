import {
  CONSULTATION_CLOSES_MINUTES_AFTER,
  CONSULTATION_OPENS_MINUTES_BEFORE,
  type ConsultationWindow,
} from '@mindease/shared';

const MINUTE = 60_000;

/**
 * When an online session's chat accepts messages: from shortly before the
 * start until a while after the scheduled end, and only while confirmed.
 */
export function chatWindow(
  appt: { startsAt: Date; endsAt: Date; status: string },
  now = new Date(),
): { opensAt: Date; closesAt: Date; window: ConsultationWindow } {
  const opensAt = new Date(appt.startsAt.getTime() - CONSULTATION_OPENS_MINUTES_BEFORE * MINUTE);
  const closesAt = new Date(appt.endsAt.getTime() + CONSULTATION_CLOSES_MINUTES_AFTER * MINUTE);
  const window: ConsultationWindow =
    appt.status !== 'ACCEPTED' || now >= closesAt ? 'CLOSED' : now < opensAt ? 'UPCOMING' : 'OPEN';
  return { opensAt, closesAt, window };
}
