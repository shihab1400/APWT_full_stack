import type { RiskLevel } from '@mindease/shared';

export interface ScoringQuestion {
  options: { label: string; score: number }[];
  critical: boolean;
}

export interface ScoringResult {
  score: number;
  maxScore: number;
  riskLevel: RiskLevel;
  critical: boolean;
}

export class InvalidAnswersError extends Error {}

/**
 * Sums option scores and maps the total onto the quiz thresholds. A non-zero
 * answer to a critical question (such as thoughts of self-harm) is always HIGH.
 */
export function scoreAttempt(
  questions: ScoringQuestion[],
  answers: number[],
  thresholds: { moderateRiskScore: number; highRiskScore: number },
): ScoringResult {
  if (answers.length !== questions.length) {
    throw new InvalidAnswersError(`Expected ${questions.length} answers, got ${answers.length}`);
  }

  let score = 0;
  let maxScore = 0;
  let critical = false;
  questions.forEach((q, i) => {
    const option = q.options[answers[i]];
    if (!option) throw new InvalidAnswersError(`Answer ${i + 1} is not a valid option`);
    score += option.score;
    maxScore += Math.max(...q.options.map((o) => o.score));
    if (q.critical && option.score > 0) critical = true;
  });

  const riskLevel: RiskLevel =
    critical || score >= thresholds.highRiskScore
      ? 'HIGH'
      : score >= thresholds.moderateRiskScore
        ? 'MODERATE'
        : 'LOW';

  return { score, maxScore, riskLevel, critical };
}
