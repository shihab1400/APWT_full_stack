import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AdminQuiz,
  CreateQuizDto,
  QuizQuestionDto,
  QuizSettingsDto,
} from '@mindease/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { ScoringQuestion } from './scoring.js';

const withQuestions = {
  questions: { orderBy: { order: 'asc' } },
  _count: { select: { attempts: true } },
} as const;
type QuizRow = Prisma.QuizGetPayload<{ include: typeof withQuestions }>;

const maxScoreOf = (questions: { options: unknown }[]) =>
  questions.reduce(
    (t, q) => t + Math.max(...(q.options as ScoringQuestion['options']).map((o) => o.score)),
    0,
  );

/**
 * Admin editing of assessments (FR_3, FR #22). Every change is audited, and
 * scoring reads the live rows, so the next submission uses the new version.
 */
@Injectable()
export class QuizAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<AdminQuiz[]> {
    const quizzes = await this.prisma.quiz.findMany({ include: withQuestions, orderBy: { createdAt: 'asc' } });
    return quizzes.map(toAdmin);
  }

  async create(actorId: string, dto: CreateQuizDto): Promise<AdminQuiz> {
    if (await this.prisma.quiz.findUnique({ where: { slug: dto.slug } })) {
      throw new ConflictException('An assessment with this short name already exists');
    }
    // Starts hidden until it has questions and sensible thresholds.
    const quiz = await this.prisma.quiz.create({
      data: { ...dto, moderateRiskScore: 5, highRiskScore: 10, active: false },
      include: withQuestions,
    });
    await this.audit(actorId, 'QUIZ_CREATED', quiz.id, { slug: dto.slug, title: dto.title });
    return toAdmin(quiz);
  }

  async updateSettings(actorId: string, quizId: string, dto: QuizSettingsDto): Promise<AdminQuiz> {
    const quiz = await this.find(quizId);
    const max = maxScoreOf(quiz.questions);
    if (dto.active && quiz.questions.length === 0) {
      throw new BadRequestException('Add at least one question before publishing');
    }
    if (quiz.questions.length && dto.highRiskScore > max) {
      throw new BadRequestException(`The high-risk score can be at most ${max}, the highest possible total`);
    }

    const before = {
      title: quiz.title,
      description: quiz.description ?? '',
      moderateRiskScore: quiz.moderateRiskScore,
      highRiskScore: quiz.highRiskScore,
      active: quiz.active,
    };
    const changes = Object.fromEntries(
      Object.entries(dto)
        .filter(([k, v]) => before[k as keyof typeof before] !== v)
        .map(([k, v]) => [k, { from: before[k as keyof typeof before], to: v }]),
    );
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.quiz.update({
        where: { id: quizId },
        data: { ...dto, description: dto.description || null },
        include: withQuestions,
      });
      await this.audit(actorId, 'QUIZ_MODIFIED', quizId, changes, tx);
      return row;
    });
    return toAdmin(updated);
  }

  async addQuestion(actorId: string, quizId: string, dto: QuizQuestionDto): Promise<AdminQuiz> {
    const quiz = await this.find(quizId);
    const order = (quiz.questions.at(-1)?.order ?? 0) + 1;
    await this.prisma.$transaction(async (tx) => {
      const q = await tx.quizQuestion.create({ data: { quizId, order, ...dto } });
      await this.audit(actorId, 'QUIZ_QUESTION_ADDED', quizId, { questionId: q.id, text: dto.text }, tx);
    });
    return toAdmin(await this.find(quizId));
  }

  async updateQuestion(actorId: string, quizId: string, questionId: string, dto: QuizQuestionDto): Promise<AdminQuiz> {
    const quiz = await this.find(quizId);
    const question = quiz.questions.find((q) => q.id === questionId);
    if (!question) throw new NotFoundException('Question not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.quizQuestion.update({ where: { id: questionId }, data: dto });
      await this.audit(
        actorId,
        'QUIZ_QUESTION_UPDATED',
        quizId,
        { questionId, order: question.order, from: question.text, to: dto.text },
        tx,
      );
    });
    return toAdmin(await this.find(quizId));
  }

  async deleteQuestion(actorId: string, quizId: string, questionId: string): Promise<AdminQuiz> {
    const quiz = await this.find(quizId);
    const question = quiz.questions.find((q) => q.id === questionId);
    if (!question) throw new NotFoundException('Question not found');
    if (quiz.active && quiz.questions.length === 1) {
      throw new ConflictException('A published assessment needs at least one question. Unpublish it first.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.quizQuestion.delete({ where: { id: questionId } });
      // Close the gap in numbering. Going via negatives avoids clashing with the
      // (quizId, order) unique index mid-update.
      await tx.quizQuestion.updateMany({
        where: { quizId, order: { gt: question.order } },
        data: { order: { multiply: -1 } },
      });
      await tx.$executeRaw`UPDATE "QuizQuestion" SET "order" = -"order" - 1 WHERE "quizId" = ${quizId} AND "order" < 0`;
      await this.audit(actorId, 'QUIZ_QUESTION_DELETED', quizId, { order: question.order, text: question.text }, tx);
    });
    return toAdmin(await this.find(quizId));
  }

  private async find(id: string): Promise<QuizRow> {
    const quiz = await this.prisma.quiz.findUnique({ where: { id }, include: withQuestions });
    if (!quiz) throw new NotFoundException('Assessment not found');
    return quiz;
  }

  private audit(
    actorId: string,
    action: string,
    quizId: string,
    meta: Prisma.InputJsonValue,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    return db.auditLog.create({ data: { actorId, action, targetType: 'Quiz', targetId: quizId, meta } });
  }
}

function toAdmin(q: QuizRow): AdminQuiz {
  return {
    id: q.id,
    slug: q.slug,
    title: q.title,
    description: q.description,
    moderateRiskScore: q.moderateRiskScore,
    highRiskScore: q.highRiskScore,
    maxScore: maxScoreOf(q.questions),
    active: q.active,
    attemptCount: q._count.attempts,
    updatedAt: q.updatedAt.toISOString(),
    questions: q.questions.map((x) => ({
      id: x.id,
      order: x.order,
      text: x.text,
      options: x.options as AdminQuiz['questions'][number]['options'],
      critical: x.critical,
    })),
  };
}
