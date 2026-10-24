import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AccountStatus,
  AuditLogPage,
  RiskAlertList,
  RiskLevel,
  Role,
} from '@mindease/shared';
import { referenceOf } from '../contact/reference.js';
import { PrismaService } from '../prisma/prisma.service.js';

const userListSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  emailVerified: true,
  createdAt: true,
} as const;

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /** Search by name or email (FR_2), optionally narrowed by role and status. */
  listUsers(f: { q?: string; role?: Role; status?: AccountStatus } = {}) {
    return this.prisma.user.findMany({
      where: {
        role: f.role,
        status: f.status,
        ...(f.q
          ? {
              OR: [
                { name: { contains: f.q, mode: 'insensitive' } },
                { email: { contains: f.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: userListSelect,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  // ───────────── Risk alerts (FR #20) ─────────────

  async listRiskAlerts(f: { severity?: RiskLevel; open?: boolean }): Promise<RiskAlertList> {
    const [rows, total, open, bookedDoctor] = await Promise.all([
      this.prisma.riskAlert.findMany({
        where: { severity: f.severity, ...(f.open === undefined ? {} : { followedUp: !f.open }) },
        include: { user: { select: { id: true, name: true, email: true } } },
        // Open alerts first, newest first within each group.
        orderBy: [{ followedUp: 'asc' }, { createdAt: 'desc' }],
        take: 300,
      }),
      this.prisma.riskAlert.count(),
      this.prisma.riskAlert.count({ where: { followedUp: false } }),
      this.prisma.riskAlert.count({ where: { bookedDoctor: true } }),
    ]);
    return {
      items: rows.map((a) => ({
        id: a.id,
        source: a.source,
        severity: a.severity,
        detail: a.detail,
        bookedDoctor: a.bookedDoctor,
        followedUp: a.followedUp,
        followedUpAt: a.followedUpAt?.toISOString() ?? null,
        followUpNote: a.followUpNote,
        createdAt: a.createdAt.toISOString(),
        user: a.user,
      })),
      counts: { total, open, bookedDoctor },
    };
  }

  async followUpRiskAlert(actorId: string, id: string, note: string) {
    const alert = await this.prisma.riskAlert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundException('Alert not found');
    if (alert.followedUp) throw new BadRequestException('This alert is already followed up');
    await this.prisma.$transaction([
      this.prisma.riskAlert.update({
        where: { id },
        data: { followedUp: true, followedUpAt: new Date(), followUpNote: note },
      }),
      this.prisma.auditLog.create({
        data: { actorId, action: 'RISK_ALERT_FOLLOWED_UP', targetType: 'RiskAlert', targetId: id, reason: note },
      }),
    ]);
    return { ok: true };
  }

  // ───────────── Audit log (FR #24) ─────────────

  async auditLog(f: { action?: string; actorId?: string; from?: Date; to?: Date }): Promise<AuditLogPage> {
    const [rows, actions] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { action: f.action, actorId: f.actorId, createdAt: { gte: f.from, lt: f.to } },
        include: { actor: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      this.prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
        reason: r.reason,
        meta: r.meta,
        createdAt: r.createdAt.toISOString(),
        actor: r.actor,
      })),
      actions: actions.map((a) => a.action),
    };
  }

  async setStatus(actorId: string, userId: string, status: AccountStatus, reason: string) {
    if (actorId === userId) throw new BadRequestException('You cannot change your own status');
    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new NotFoundException('User not found');

    const [user] = await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { status }, select: userListSelect }),
      this.prisma.auditLog.create({
        data: {
          actorId,
          action: status === 'DEACTIVATED' ? 'USER_DEACTIVATED' : 'USER_ACTIVATED',
          targetType: 'User',
          targetId: userId,
          reason,
        },
      }),
      // Deactivated users lose their sessions right away.
      ...(status === 'DEACTIVATED'
        ? [
            this.prisma.refreshToken.updateMany({
              where: { userId, revokedAt: null },
              data: { revokedAt: new Date() },
            }),
          ]
        : []),
    ]);
    return user;
  }

  async listContactMessages() {
    const messages = await this.prisma.contactMessage.findMany({
      orderBy: [{ handled: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return messages.map((m) => ({ ...m, reference: referenceOf(m.id) }));
  }

  async setContactHandled(actorId: string, id: string, handled: boolean) {
    const exists = await this.prisma.contactMessage.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Message not found');
    const [message] = await this.prisma.$transaction([
      this.prisma.contactMessage.update({ where: { id }, data: { handled } }),
      this.prisma.auditLog.create({
        data: {
          actorId,
          action: handled ? 'CONTACT_HANDLED' : 'CONTACT_REOPENED',
          targetType: 'ContactMessage',
          targetId: id,
        },
      }),
    ]);
    return { ...message, reference: referenceOf(message.id) };
  }
}
