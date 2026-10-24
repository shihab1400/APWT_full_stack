import { z } from 'zod';

export const DOCTOR_FEE_MIN = 100;
export const DOCTOR_FEE_MAX = 20_000;

export const LICENSE_MAX_BYTES = 5 * 1024 * 1024;
export const LICENSE_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg'] as const;
export type LicenseMimeType = (typeof LICENSE_MIME_TYPES)[number];

/** Professional details a doctor fills in before submitting for verification. */
export const doctorProfileSchema = z.object({
  specialization: z.string().trim().min(2, { error: 'Enter your specialization' }).max(100),
  qualifications: z.string().trim().min(2, { error: 'Enter your qualifications' }).max(200),
  experienceYears: z.int({ error: 'Enter whole years' }).min(0).max(60),
  fee: z
    .int({ error: 'Enter a whole amount in BDT' })
    .min(DOCTOR_FEE_MIN, { error: `Minimum fee is ${DOCTOR_FEE_MIN} BDT` })
    .max(DOCTOR_FEE_MAX, { error: `Maximum fee is ${DOCTOR_FEE_MAX} BDT` }),
  bio: z
    .string()
    .trim()
    .min(30, { error: 'Write at least 30 characters about your practice' })
    .max(2000),
  /** Leave empty to offer online (text) consultations only. */
  clinicAddress: z.string().trim().max(300).default(''),
});
export type DoctorProfileInput = z.input<typeof doctorProfileSchema>;
export type DoctorProfileDto = z.output<typeof doctorProfileSchema>;

/**
 * INCOMPLETE: still filling in the profile. SUBMITTED: waiting for an admin.
 * APPROVED: verified and visible. REJECTED: needs changes (see rejectReason).
 */
export type DoctorProfileStatus = 'INCOMPLETE' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

export interface DoctorSelfProfile {
  id: string;
  name: string;
  email: string;
  specialization: string | null;
  qualifications: string | null;
  experienceYears: number | null;
  fee: number;
  bio: string | null;
  clinicAddress: string | null;
  hasLicense: boolean;
  licenseMimeType: string | null;
  status: DoctorProfileStatus;
  rejectReason: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  /** What is still needed before the profile can be submitted. */
  missing: string[];
}

export interface AdminDoctorRow extends Omit<DoctorSelfProfile, 'missing'> {
  userId: string;
  accountStatus: 'ACTIVE' | 'DEACTIVATED';
  createdAt: string;
}

export const rejectDoctorSchema = z.object({
  reason: z.string().trim().min(3, { error: 'Tell the doctor what to fix' }).max(500),
});
export type RejectDoctorDto = z.infer<typeof rejectDoctorSchema>;
