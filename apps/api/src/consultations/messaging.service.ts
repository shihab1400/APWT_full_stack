import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CONSULTATION_OPENS_MINUTES_BEFORE,
  type ConsultationMessageItem,
  type ConsultationSummary,
  type ConsultationThread,
  type ConsultationUnread,
} from '@mindease/shared';
import { formatDhaka } from '../common/dhaka-time.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { detectCrisis } from '../risk/crisis-detector.js';
import { RiskService } from '../risk/risk.service.js';
import type { ConsultationMessage, Prisma } from '../generated/prisma/client.js';
import { chatWindow } from './chat-window.js';

/** Online sessions that have (or had) a chat. Requests become chats once confirmed. */
const CHAT_STATUSES = ['ACCEPTED', 'COMPLETED'] as const;
const THREAD_LIMIT = 500;

const threadSelect = {
  id: true,
  status: true,
  startsAt: true,
  endsAt: true,
  patientId: true,
  patient: { select: { id: true, name: true } },
  doctor: { select: { userId: true, user: { select: { id: true, name: true } } } },
} as const;
type ThreadRow = Prisma.AppointmentGetPayload<{ select: typeof threadSelect }>;

/** Where the user takes part as patient or as the doctor. */
const participant = (userId: string): Prisma.AppointmentWhereInput => ({
  type: 'ONLINE',
  status: { in: [...CHAT_STATUSES] },
  OR: [{ patientId: userId }, { doctor: { userId } }],
});

/**
 * Patient–doctor text consultations (FR #28). Only the two participants can
 * read or write; admins have no access. Delivery is live over the user's
 * notification stream, with the database as the record.
 */
@Injectable()
export class MessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly risk: RiskService,
  ) {}

  async list(userId: string, now = new Date()): Promise<ConsultationSummary[]> {
    const appts = await this.prisma.appointment.findMany({ where: participant(userId), select: threadSelect });
    const ids = appts.map((a) => a.id);
    const [unread, latest] = await Promise.all([
      this.prisma.consultationMessage.groupBy({
        by: ['appointmentId'],
        where: { appointmentId: { in: ids }, senderId: { not: userId }, readAt: null },
        _count: { _all: true },
      }),
      this.prisma.consultationMessage.findMany({
        where: { appointmentId: { in: ids } },
        orderBy: { createdAt: 'desc' },
        distinct: ['appointmentId'],
      }),
    ]);
    const unreadBy = new Map(unread.map((u) => [u.appointmentId, u._count._all]));
    const latestBy = new Map(latest.map((m) => [m.appointmentId, m]));

    const rank = { OPEN: 0, UPCOMING: 1, CLOSED: 2 } as const;
    return appts
      .map((a) => summarize(a, userId, now, unreadBy.get(a.id) ?? 0, latestBy.get(a.id)))
      .sort(
        (a, b) =>
          rank[a.window] - rank[b.window] ||
          // Soonest upcoming first; most recent closed first.
          (a.window === 'CLOSED' ? b.startsAt.localeCompare(a.startsAt) : a.startsAt.localeCompare(b.startsAt)),
      );
  }

  async unread(userId: string): Promise<ConsultationUnread> {
    const total = await this.prisma.consultationMessage.count({
      where: { senderId: { not: userId }, readAt: null, appointment: participant(userId) },
    });
    return { total };
  }

  /** The thread, marking the other side's messages as read. */
  async thread(userId: string, appointmentId: string, now = new Date()): Promise<ConsultationThread> {
    const appt = await this.find(userId, appointmentId);
    await this.markRead(userId, appt);
    const messages = await this.prisma.consultationMessage.findMany({
      where: { appointmentId },
      orderBy: { createdAt: 'desc' },
      take: THREAD_LIMIT,
    });
    messages.reverse();
    return {
      ...summarize(appt, userId, now, 0, messages.at(-1)),
      messages: messages.map(toItem),
    };
  }

  async read(userId: string, appointmentId: string): Promise<void> {
    await this.markRead(userId, await this.find(userId, appointmentId));
  }

  async send(userId: string, appointmentId: string, body: string, now = new Date()): Promise<ConsultationMessageItem> {
    const appt = await this.find(userId, appointmentId);
    const { window, opensAt } = chatWindow(appt, now);
    if (window === 'UPCOMING') {
      throw new ConflictException(
        `The chat opens ${formatDhaka(opensAt)}, ${CONSULTATION_OPENS_MINUTES_BEFORE} minutes before the session.`,
      );
    }
    if (window === 'CLOSED') throw new ConflictException('This consultation has ended. The chat is read-only.');

    const fromPatient = appt.patientId === userId;
    // Safety net for the patient side; the doctor is a professional already present.
    const flagged = fromPatient && detectCrisis(body).flagged;
    const message = await this.prisma.consultationMessage.create({
      data: { appointmentId, senderId: userId, body, flagged },
    });
    if (flagged) {
      await this.risk.raise({
        userId,
        source: 'CONSULTATION',
        severity: 'HIGH',
        sourceId: message.id,
        detail: 'Crisis language in a consultation chat',
      });
    }

    const item = toItem(message);
    for (const id of [appt.patientId, appt.doctor.userId]) {
      this.notifications.push(id, { event: 'message', data: item });
    }
    return item;
  }

  private async markRead(userId: string, appt: ThreadRow) {
    const readAt = new Date();
    const { count } = await this.prisma.consultationMessage.updateMany({
      where: { appointmentId: appt.id, senderId: { not: userId }, readAt: null },
      data: { readAt },
    });
    if (count) {
      const other = appt.patientId === userId ? appt.doctor.userId : appt.patientId;
      this.notifications.push(other, {
        event: 'read',
        data: { appointmentId: appt.id, readerId: userId, readAt: readAt.toISOString() },
      });
    }
  }

  private async find(userId: string, appointmentId: string): Promise<ThreadRow> {
    // Anyone else, admins included, gets a plain 404.
    const appt = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, ...participant(userId) },
      select: threadSelect,
    });
    if (!appt) throw new NotFoundException('Consultation not found');
    return appt;
  }
}

function summarize(
  a: ThreadRow,
  userId: string,
  now: Date,
  unreadCount: number,
  last?: ConsultationMessage,
): ConsultationSummary {
  const isPatient = a.patientId === userId;
  const { opensAt, closesAt, window } = chatWindow(a, now);
  return {
    appointmentId: a.id,
    myRole: isPatient ? 'PATIENT' : 'DOCTOR',
    counterpart: isPatient ? a.doctor.user : a.patient,
    status: a.status,
    startsAt: a.startsAt.toISOString(),
    endsAt: a.endsAt.toISOString(),
    opensAt: opensAt.toISOString(),
    closesAt: closesAt.toISOString(),
    window,
    lastMessage: last
      ? { body: last.body.slice(0, 120), createdAt: last.createdAt.toISOString(), mine: last.senderId === userId }
      : null,
    unreadCount,
  };
}

function toItem(m: ConsultationMessage): ConsultationMessageItem {
  return {
    id: m.id,
    appointmentId: m.appointmentId,
    senderId: m.senderId,
    body: m.body,
    flagged: m.flagged,
    readAt: m.readAt?.toISOString() ?? null,
    createdAt: m.createdAt.toISOString(),
  };
}
