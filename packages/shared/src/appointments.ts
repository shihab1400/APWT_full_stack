import { z } from 'zod';

export const AppointmentType = {
  ONLINE: 'ONLINE',
  OFFLINE: 'OFFLINE',
} as const;
export type AppointmentType = (typeof AppointmentType)[keyof typeof AppointmentType];

export const APPOINTMENT_TYPE_LABEL: Record<AppointmentType, string> = {
  ONLINE: 'Online (text chat)',
  OFFLINE: 'In person',
};

export const AppointmentStatus = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  REQUESTED: 'REQUESTED',
  ACCEPTED: 'ACCEPTED',
  DECLINED: 'DECLINED',
  CANCELLED: 'CANCELLED',
  COMPLETED: 'COMPLETED',
} as const;
export type AppointmentStatus = (typeof AppointmentStatus)[keyof typeof AppointmentStatus];

/** Statuses that hold the slot so nobody else can book it. */
export const ACTIVE_APPOINTMENT_STATUSES = ['PENDING_PAYMENT', 'REQUESTED', 'ACCEPTED'] as const;

export const bookAppointmentSchema = z.object({
  doctorId: z.uuid(),
  startsAt: z.iso.datetime({ offset: true, error: 'Choose a time slot' }),
  type: z.enum(['ONLINE', 'OFFLINE'], { error: 'Choose online or in person' }),
  note: z.string().trim().max(500, { error: 'Keep the note under 500 characters' }).optional(),
});
export type BookAppointmentDto = z.infer<typeof bookAppointmentSchema>;

export const declineAppointmentSchema = z.object({
  reason: z.string().trim().min(3, { error: 'Give the patient a reason' }).max(500),
});
export type DeclineAppointmentDto = z.infer<typeof declineAppointmentSchema>;

/** Patients may cancel without a reason; doctors must give one. */
export const cancelAppointmentSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
export type CancelAppointmentDto = z.infer<typeof cancelAppointmentSchema>;

export interface AppointmentItem {
  id: string;
  type: AppointmentType;
  status: AppointmentStatus;
  startsAt: string;
  endsAt: string;
  patientNote: string | null;
  declineReason: string | null;
  cancelReason: string | null;
  cancelledBy: 'PATIENT' | 'DOCTOR' | 'SYSTEM' | null;
  createdAt: string;
  doctor: {
    id: string;
    name: string;
    specialization: string | null;
    fee: number;
    clinicAddress: string | null;
  };
  patient: { id: string; name: string };
  /** The consultation payment, if one was started. */
  payment: { reference: string; status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUND_DUE' | 'REFUNDED'; amount: number } | null;
}
