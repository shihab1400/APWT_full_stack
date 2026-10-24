import { HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  CHAT_LIMIT_REACHED,
  FREE_DAILY_CHAT_LIMIT,
  type ChatMessageItem,
  type ChatSessionSummary,
  type ChatStreamEvent,
  type ChatUsage,
  type Role,
} from '@mindease/shared';
import { AiService, type AiTurn } from '../ai/ai.service.js';
import { ContentService } from '../content/content.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { detectCrisis } from '../risk/crisis-detector.js';
import { RiskService } from '../risk/risk.service.js';
import { TierService } from '../subscriptions/tier.service.js';
import { dhakaDay } from '../common/dhaka-time.js';

/** How many earlier messages are sent to the model as context. */
const HISTORY_TURNS = 20;
const TITLE_LENGTH = 60;

export const FALLBACK_REPLY =
  "I'm sorry, I'm having trouble responding right now. Your message matters. If you're struggling, please reach out to someone you trust, call the MindEase Emergency Service on 01568978234 (24/7), or call 999 if you are in danger. You can also book one of our verified doctors.";

export const CRISIS_OVER_LIMIT_REPLY =
  "It sounds like you're going through something really painful, and you don't have to face it alone. Please call 999 or the MindEase Emergency Service on 01568978234 right now. They're available 24/7 and free. If you can, reach out to someone you trust and stay with them.";

export type Emit = (event: ChatStreamEvent) => void;

export interface PreparedTurn {
  userId: string;
  sessionId: string;
  sessionTitle: string | null;
  content: string;
  crisis: boolean;
  /** True when a free user is over today's limit but sent a crisis message. */
  overLimit: boolean;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly tiers: TierService,
    private readonly risk: RiskService,
    private readonly content: ContentService,
  ) {}

  async usage(user: { id: string; role: Role }): Promise<ChatUsage> {
    const { start, end } = dhakaDay();
    const [tier, used] = await Promise.all([
      this.tiers.tierOf(user),
      this.prisma.chatMessage.count({
        where: { role: 'USER', createdAt: { gte: start }, session: { userId: user.id } },
      }),
    ]);
    return {
      used,
      limit: tier === 'PAID' ? null : FREE_DAILY_CHAT_LIMIT,
      resetsAt: end.toISOString(),
    };
  }

  listSessions(userId: string): Promise<ChatSessionSummary[]> {
    return this.prisma.chatSession
      .findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, title: true, updatedAt: true },
        take: 100,
      })
      .then((rows) => rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() })));
  }

  async messages(userId: string, sessionId: string): Promise<ChatMessageItem[]> {
    await this.ownedSession(userId, sessionId);
    const rows = await this.prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, role: true, content: true, createdAt: true },
    });
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  }

  async deleteSession(userId: string, sessionId: string): Promise<void> {
    await this.ownedSession(userId, sessionId);
    await this.prisma.chatSession.delete({ where: { id: sessionId } });
  }

  /**
   * Validates a new message before any response is streamed, so failures can
   * still be sent as normal HTTP errors. Crisis messages are never blocked by
   * the daily limit.
   */
  async prepare(
    user: { id: string; role: Role },
    input: { sessionId?: string; content: string },
  ): Promise<PreparedTurn> {
    const crisis = detectCrisis(input.content).flagged;

    const session = input.sessionId
      ? await this.ownedSession(user.id, input.sessionId)
      : null;

    const usage = await this.usage(user);
    const overLimit = usage.limit !== null && usage.used >= usage.limit;
    if (overLimit && !crisis) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: CHAT_LIMIT_REACHED,
          message: `You've used your ${usage.limit} free messages for today. Upgrade to Premium for unlimited chat.`,
          usage,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const created =
      session ??
      (await this.prisma.chatSession.create({
        data: { userId: user.id, title: titleFrom(input.content) },
      }));

    return {
      userId: user.id,
      sessionId: created.id,
      sessionTitle: created.title,
      content: input.content,
      crisis,
      overLimit,
    };
  }

  /** Saves the user's message and streams the reply through `emit`. */
  async respond(
    turn: PreparedTurn,
    user: { id: string; role: Role },
    emit: Emit,
    signal: AbortSignal,
  ): Promise<void> {
    const userMessage = await this.prisma.chatMessage.create({
      data: { sessionId: turn.sessionId, role: 'USER', content: turn.content, flagged: turn.crisis },
    });
    emit({
      event: 'session',
      data: { sessionId: turn.sessionId, title: turn.sessionTitle, userMessageId: userMessage.id },
    });

    if (turn.crisis) {
      await this.risk.raise({
        userId: turn.userId,
        source: 'CHAT',
        severity: 'HIGH',
        sourceId: userMessage.id,
        detail: 'Crisis language detected in AI chat',
      });
      emit({ event: 'crisis', data: { hotlines: await this.content.listHotlines() } });
    }

    let reply = '';
    if (turn.overLimit) {
      reply = CRISIS_OVER_LIMIT_REPLY;
      emit({ event: 'delta', data: { text: reply } });
    } else {
      try {
        for await (const text of this.ai.streamReply(await this.history(turn.sessionId), signal)) {
          reply += text;
          emit({ event: 'delta', data: { text } });
        }
      } catch (err) {
        if (signal.aborted) {
          this.logger.log(`Client left session ${turn.sessionId} mid-reply`);
        } else {
          this.logger.error(`AI reply failed: ${err instanceof Error ? err.message : String(err)}`);
          // Keep whatever streamed, then close with the safe fallback.
          const fallback = (reply ? '\n\n' : '') + FALLBACK_REPLY;
          reply += fallback;
          emit({ event: 'delta', data: { text: fallback } });
        }
      }
    }

    if (!reply.trim()) return;
    const [assistantMessage] = await this.prisma.$transaction([
      this.prisma.chatMessage.create({
        data: { sessionId: turn.sessionId, role: 'ASSISTANT', content: reply },
      }),
      this.prisma.chatSession.update({
        where: { id: turn.sessionId },
        data: { updatedAt: new Date() },
      }),
    ]);
    emit({ event: 'done', data: { messageId: assistantMessage.id, usage: await this.usage(user) } });
  }

  private async history(sessionId: string): Promise<AiTurn[]> {
    const recent = await this.prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_TURNS,
      select: { role: true, content: true },
    });
    return recent
      .reverse()
      .map((m) => ({ role: m.role === 'USER' ? 'user' : 'model', text: m.content }));
  }

  private async ownedSession(userId: string, sessionId: string) {
    const session = await this.prisma.chatSession.findFirst({ where: { id: sessionId, userId } });
    // Same 404 for missing and not-yours, so ids can't be probed.
    if (!session) throw new NotFoundException('Conversation not found');
    return session;
  }
}

function titleFrom(content: string): string {
  const oneLine = content.replace(/\s+/g, ' ').trim();
  return oneLine.length > TITLE_LENGTH ? `${oneLine.slice(0, TITLE_LENGTH - 1)}…` : oneLine;
}
