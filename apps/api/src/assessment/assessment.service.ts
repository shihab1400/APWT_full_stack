import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AttemptHistoryItem,
  AttemptResult,
  QuizForTaking,
  QuizSummary,
} from '@mindease/shared';
import { DoctorsService } from '../doctors/doctors.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RiskService } from '../risk/risk.service.js';
import { InvalidAnswersError, scoreAttempt, type ScoringQuestion } from './scoring.js';

const RECOMMENDED_DOCTORS = 3;

@Injectable()
export class AssessmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly risk: RiskService,
    private readonly doctors: DoctorsService,
  ) {}

  async listQuizzes(): Promise<QuizSummary[]> {
    const quizzes = await this.prisma.quiz.findMany({
      where: { active: true },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { questions: true } } },
    });
    return quizzes.map((q) => ({
      id: q.id,
      slug: q.slug,
      title: q.title,
      description: q.description,
      questionCount: q._count.questions,
    }));
  }

  /** The quiz with option labels only; scores stay on the server. */
  async getQuiz(id: string): Promise<QuizForTaking> {
    const quiz = await this.activeQuiz(id);
    return {
      id: quiz.id,
      slug: quiz.slug,
      title: quiz.title,
      description: quiz.description,
      questionCount: quiz.questions.length,
      questions: quiz.questions.map((q) => ({
        id: q.id,
        order: q.order,
        text: q.text,
        options: optionsOf(q).map(({ label }) => ({ label })),
      })),
    };
  }

  async submit(userId: string, quizId: string, answers: number[]): Promise<AttemptResult> {
    const quiz = await this.activeQuiz(quizId);

    let result;
    try {
      // Thresholds are read at submit time, so admin changes apply to the next attempt.
      result = scoreAttempt(
        quiz.questions.map((q) => ({ options: optionsOf(q), critical: q.critical })),
        answers,
        quiz,
      );
    } catch (err) {
      if (err instanceof InvalidAnswersError) throw new BadRequestException(err.message);
      throw err;
    }

    const attempt = await this.prisma.quizAttempt.create({
      data: { quizId, userId, answers, ...result },
    });

    if (result.riskLevel === 'HIGH') {
      await this.risk.raise({
        userId,
        source: 'QUIZ',
        severity: 'HIGH',
        sourceId: attempt.id,
        detail: result.critical
          ? `${quiz.title}: self-harm item answered (score ${result.score}/${result.maxScore})`
          : `${quiz.title}: score ${result.score}/${result.maxScore}`,
      });
    }

    const recommendDoctor = result.riskLevel === 'HIGH';
    const doctors = recommendDoctor
      ? (await this.doctors.listPublic({})).slice(0, RECOMMENDED_DOCTORS)
      : [];

    return {
      attemptId: attempt.id,
      quizTitle: quiz.title,
      ...result,
      recommendDoctor,
      doctors,
      createdAt: attempt.createdAt.toISOString(),
    };
  }

  async history(userId: string): Promise<AttemptHistoryItem[]> {
    const attempts = await this.prisma.quizAttempt.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { quiz: { select: { title: true } } },
      take: 50,
    });
    return attempts.map((a) => ({
      id: a.id,
      quizTitle: a.quiz.title,
      score: a.score,
      maxScore: a.maxScore,
      riskLevel: a.riskLevel,
      critical: a.critical,
      createdAt: a.createdAt.toISOString(),
    }));
  }

  private async activeQuiz(id: string) {
    const quiz = await this.prisma.quiz.findFirst({
      where: { id, active: true },
      include: { questions: { orderBy: { order: 'asc' } } },
    });
    if (!quiz) throw new NotFoundException('Assessment not found');
    return quiz;
  }
}

function optionsOf(question: { options: unknown }): ScoringQuestion['options'] {
  return question.options as ScoringQuestion['options'];
}
