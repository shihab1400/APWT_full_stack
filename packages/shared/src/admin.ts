import { z } from 'zod';
import type { RiskLevel } from './assessment.js';

// ───────────── Risk alerts (FR #20) ─────────────

export interface RiskAlertItem {
  id: string;
  source: 'QUIZ' | 'CHAT';
  severity: RiskLevel;
  detail: string | null;
  /** The user went on to book a doctor after the alert. */
  bookedDoctor: boolean;
  followedUp: boolean;
  followedUpAt: string | null;
  followUpNote: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string };
}

export interface RiskAlertList {
  items: RiskAlertItem[];
  counts: { total: number; open: number; bookedDoctor: number };
}

export const followUpSchema = z.object({
  note: z.string().trim().min(3, { error: 'Note what was done' }).max(500),
});
export type FollowUpDto = z.infer<typeof followUpSchema>;

// ───────────── Audit log (FR #24) ─────────────

export interface AuditLogItem {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  reason: string | null;
  meta: unknown;
  createdAt: string;
  actor: { id: string; name: string; email: string };
}

export interface AuditLogPage {
  items: AuditLogItem[];
  /** Every action name in the log, for the filter. */
  actions: string[];
}

// ───────────── Users (FR_2) ─────────────

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  role: 'USER' | 'DOCTOR' | 'ADMIN';
  status: 'ACTIVE' | 'DEACTIVATED';
  emailVerified: boolean;
  createdAt: string;
}

// ───────────── Assessments (FR_3, FR #22) ─────────────

export const quizOptionSchema = z.object({
  label: z.string().trim().min(1, { error: 'Option text is required' }).max(100),
  score: z.int().min(0).max(10),
});

export const quizQuestionSchema = z.object({
  text: z.string().trim().min(5, { error: 'Write the question' }).max(300),
  options: z
    .array(quizOptionSchema)
    .min(2, { error: 'Add at least two options' })
    .max(8)
    .refine((o) => o.some((x) => x.score === 0), { error: 'One option should score 0' }),
  /** Any answer above zero makes the result HIGH (e.g. thoughts of self-harm). */
  critical: z.boolean().default(false),
});
export type QuizQuestionInput = z.input<typeof quizQuestionSchema>;
export type QuizQuestionDto = z.output<typeof quizQuestionSchema>;

export const quizSettingsSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().max(500).default(''),
    moderateRiskScore: z.int().min(1),
    highRiskScore: z.int().min(1),
    active: z.boolean(),
  })
  .refine((q) => q.highRiskScore > q.moderateRiskScore, {
    error: 'The high-risk score must be above the moderate score',
    path: ['highRiskScore'],
  });
export type QuizSettingsInput = z.input<typeof quizSettingsSchema>;
export type QuizSettingsDto = z.output<typeof quizSettingsSchema>;

export const createQuizSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, { error: 'Use lowercase letters, numbers and dashes' })
    .max(40),
  title: z.string().trim().min(3).max(120),
});
export type CreateQuizDto = z.infer<typeof createQuizSchema>;

export interface AdminQuizQuestion {
  id: string;
  order: number;
  text: string;
  options: { label: string; score: number }[];
  critical: boolean;
}

export interface AdminQuiz {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  moderateRiskScore: number;
  highRiskScore: number;
  /** Highest possible total with the current questions. */
  maxScore: number;
  active: boolean;
  attemptCount: number;
  updatedAt: string;
  questions: AdminQuizQuestion[];
}
