import { z } from 'zod';

export const ReviewStatus = {
  VISIBLE: 'VISIBLE',
  /** Reported or under admin review; still public until hidden. */
  FLAGGED: 'FLAGGED',
  HIDDEN: 'HIDDEN',
} as const;
export type ReviewStatus = (typeof ReviewStatus)[keyof typeof ReviewStatus];

export const REVIEW_COMMENT_MAX = 1000;

export const reviewSchema = z.object({
  rating: z.int({ error: 'Choose 1 to 5 stars' }).min(1, { error: 'Choose 1 to 5 stars' }).max(5),
  comment: z
    .string()
    .trim()
    .max(REVIEW_COMMENT_MAX, { error: `Keep it under ${REVIEW_COMMENT_MAX} characters` })
    .optional(),
});
export type ReviewDto = z.infer<typeof reviewSchema>;

/** Shown publicly as "Verified patient": no names. */
export interface PublicReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

export interface DoctorReviewItem extends PublicReview {
  status: ReviewStatus;
  reportReason: string | null;
}

export interface AdminReviewItem extends DoctorReviewItem {
  appointmentId: string;
  moderatedAt: string | null;
  doctor: { id: string; name: string };
  patient: { id: string; name: string; email: string };
}

export const reportReviewSchema = z.object({
  reason: z.string().trim().min(3, { error: 'Say what is wrong with this review' }).max(500),
});
export type ReportReviewDto = z.infer<typeof reportReviewSchema>;

export const moderateReviewSchema = z.object({
  status: z.enum(['VISIBLE', 'FLAGGED', 'HIDDEN']),
  reason: z.string().trim().min(3, { error: 'A reason is required' }).max(500),
});
export type ModerateReviewDto = z.infer<typeof moderateReviewSchema>;
