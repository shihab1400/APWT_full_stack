import { z } from 'zod';
import type { PublicDoctor } from './content.js';

export const RiskLevel = {
  LOW: 'LOW',
  MODERATE: 'MODERATE',
  HIGH: 'HIGH',
} as const;
export type RiskLevel = (typeof RiskLevel)[keyof typeof RiskLevel];

export interface QuizSummary {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  questionCount: number;
}

export interface QuizForTaking extends QuizSummary {
  questions: { id: string; order: number; text: string; options: { label: string }[] }[];
}

/** One answer per question, in question order: the index of the chosen option. */
export const submitAttemptSchema = z.object({
  answers: z.array(z.int().min(0)).min(1),
});
export type SubmitAttemptDto = z.infer<typeof submitAttemptSchema>;

export interface AttemptResult {
  attemptId: string;
  quizTitle: string;
  score: number;
  maxScore: number;
  riskLevel: RiskLevel;
  /** A critical item (e.g. thoughts of self-harm) was answered above zero. */
  critical: boolean;
  recommendDoctor: boolean;
  /** Verified doctors suggested when a consultation is recommended. */
  doctors: PublicDoctor[];
  createdAt: string;
}

export interface AttemptHistoryItem {
  id: string;
  quizTitle: string;
  score: number;
  maxScore: number;
  riskLevel: RiskLevel;
  critical: boolean;
  createdAt: string;
}
