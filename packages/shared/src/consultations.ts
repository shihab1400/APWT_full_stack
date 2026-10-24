import { z } from 'zod';
import type { AppointmentItem, AppointmentType } from './appointments.js';
import type { AttemptHistoryItem } from './assessment.js';

export const NOTE_MAX = 5000;

export const consultationNoteSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, { error: 'The note is empty' })
    .max(NOTE_MAX, { error: `Keep notes under ${NOTE_MAX} characters` }),
});
export type ConsultationNoteDto = z.infer<typeof consultationNoteSchema>;

/** Visible only to the doctor who wrote it; never to the patient. */
export interface ConsultationNoteItem {
  id: string;
  appointmentId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface PatientSummary {
  id: string;
  name: string;
  appointmentCount: number;
  lastSessionAt: string | null;
  nextSessionAt: string | null;
  /** Null unless the patient shared their results with this doctor. */
  latestAssessment: AttemptHistoryItem | null;
  sharesAssessments: boolean;
}

export interface PatientDetail {
  patient: { id: string; name: string };
  sharesAssessments: boolean;
  /** Most recent first; empty unless shared. */
  assessments: AttemptHistoryItem[];
  /** This doctor's appointments with the patient, newest first, each with this doctor's notes. */
  appointments: (AppointmentItem & { notes: ConsultationNoteItem[] })[];
}

export interface EarningItem {
  /** Consultation ID (the appointment ID). */
  appointmentId: string;
  patientName: string;
  type: AppointmentType;
  sessionAt: string;
  fee: number;
  paymentReference: string;
  paidAt: string | null;
}

export interface Earnings {
  items: EarningItem[];
  totals: { sessions: number; earned: number; thisMonth: number };
}
