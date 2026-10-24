import { InvalidAnswersError, scoreAttempt, type ScoringQuestion } from './scoring.js';

const options = [0, 1, 2, 3].map((score) => ({ label: `opt ${score}`, score }));
const q = (critical = false): ScoringQuestion => ({ options, critical });
// PHQ-9 shape: nine 0–3 items, the last one critical. Thresholds from the test plan.
const phq9 = [...Array.from({ length: 8 }, () => q()), q(true)];
const thresholds = { moderateRiskScore: 10, highRiskScore: 15 };

describe('scoreAttempt', () => {
  it('sums the chosen options and reports the maximum', () => {
    const result = scoreAttempt(phq9, [1, 1, 1, 1, 1, 0, 0, 0, 0], thresholds);
    expect(result).toEqual({ score: 5, maxScore: 27, riskLevel: 'LOW', critical: false });
  });

  it('is MODERATE from the moderate threshold', () => {
    expect(scoreAttempt(phq9, [2, 2, 2, 2, 2, 0, 0, 0, 0], thresholds).riskLevel).toBe('MODERATE');
  });

  it('is HIGH exactly at the high threshold (FR_3)', () => {
    const result = scoreAttempt(phq9, [3, 3, 3, 3, 3, 0, 0, 0, 0], thresholds);
    expect(result.score).toBe(15);
    expect(result.riskLevel).toBe('HIGH');
  });

  it('respects a raised threshold', () => {
    const answers = [3, 3, 3, 3, 3, 0, 0, 0, 0];
    expect(scoreAttempt(phq9, answers, { ...thresholds, highRiskScore: 16 }).riskLevel).toBe(
      'MODERATE',
    );
  });

  it('is HIGH when every answer is the most severe (FR_7)', () => {
    expect(scoreAttempt(phq9, Array(9).fill(3), thresholds).riskLevel).toBe('HIGH');
  });

  it('is HIGH for any non-zero critical answer, whatever the total', () => {
    const result = scoreAttempt(phq9, [0, 0, 0, 0, 0, 0, 0, 0, 1], thresholds);
    expect(result).toMatchObject({ score: 1, riskLevel: 'HIGH', critical: true });
  });

  it('rejects the wrong number of answers', () => {
    expect(() => scoreAttempt(phq9, [0, 0], thresholds)).toThrow(InvalidAnswersError);
  });

  it('rejects an option index that does not exist', () => {
    expect(() => scoreAttempt(phq9, [0, 0, 0, 0, 0, 0, 0, 0, 4], thresholds)).toThrow(
      InvalidAnswersError,
    );
  });
});
