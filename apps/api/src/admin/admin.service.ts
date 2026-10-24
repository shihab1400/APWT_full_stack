import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AccountStatus } from '@mindease/shared';
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

  listUsers() {
    return this.prisma.user.findMany({ select: userListSelect, orderBy: { createdAt: 'desc' } });
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
