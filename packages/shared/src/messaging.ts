import { z } from 'zod';
import type { AppointmentStatus } from './appointments.js';

/** The chat for an online session opens this long before the start… */
export const CONSULTATION_OPENS_MINUTES_BEFORE = 15;
/** …and closes this long after the scheduled end; after that it is read-only. */
export const CONSULTATION_CLOSES_MINUTES_AFTER = 60;
export const CONSULTATION_MESSAGE_MAX = 2000;

export const sendConsultationMessageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, { error: 'Message cannot be empty' })
    .max(CONSULTATION_MESSAGE_MAX, { error: `Keep messages under ${CONSULTATION_MESSAGE_MAX} characters` }),
});
export type SendConsultationMessageDto = z.infer<typeof sendConsultationMessageSchema>;

export interface ConsultationMessageItem {
  id: string;
  appointmentId: string;
  senderId: string;
  body: string;
  /** Crisis language was detected (patient messages only). */
  flagged: boolean;
  readAt: string | null;
  createdAt: string;
}

/** UPCOMING: not open yet. OPEN: both can send. CLOSED: history only. */
export type ConsultationWindow = 'UPCOMING' | 'OPEN' | 'CLOSED';

export interface ConsultationSummary {
  appointmentId: string;
  /** My side of the conversation. */
  myRole: 'PATIENT' | 'DOCTOR';
  counterpart: { id: string; name: string };
  status: AppointmentStatus;
  startsAt: string;
  endsAt: string;
  opensAt: string;
  closesAt: string;
  window: ConsultationWindow;
  lastMessage: { body: string; createdAt: string; mine: boolean } | null;
  unreadCount: number;
}

export interface ConsultationThread extends ConsultationSummary {
  messages: ConsultationMessageItem[];
}

export interface ConsultationUnread {
  total: number;
}
