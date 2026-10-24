import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Subject, filter, map, type Observable } from 'rxjs';
import type { NotificationItem, NotificationList, NotificationType } from '@mindease/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Notification } from '../generated/prisma/client.js';

export interface NewNotification {
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  /** Also "send" by email. Delivery is logged until an email provider is configured. */
  email?: boolean;
}

const LIST_LIMIT = 30;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  /** In-process fan-out to open streams. A multi-instance deploy would swap this for Redis pub/sub. */
  private readonly events = new Subject<{ userId: string; item: NotificationItem }>();

  constructor(private readonly prisma: PrismaService) {}

  /** Stores a notification for each user and pushes it to their open streams. */
  async notify(userIds: string | string[], n: NewNotification): Promise<void> {
    const ids = [...new Set(Array.isArray(userIds) ? userIds : [userIds])];
    const { email, ...data } = n;
    for (const userId of ids) {
      const row = await this.prisma.notification.create({ data: { userId, ...data } });
      this.events.next({ userId, item: toItem(row) });
    }
    if (email) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: ids } },
        select: { email: true },
      });
      for (const u of users) this.logger.log(`Email to ${u.email}: ${n.title}`);
    }
  }

  async notifyAdmins(n: NewNotification): Promise<void> {
    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN', status: 'ACTIVE' },
      select: { id: true },
    });
    await this.notify(
      admins.map((a) => a.id),
      n,
    );
  }

  stream(userId: string): Observable<NotificationItem> {
    return this.events.pipe(
      filter((e) => e.userId === userId),
      map((e) => e.item),
    );
  }

  async list(userId: string): Promise<NotificationList> {
    const [rows, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: LIST_LIMIT,
      }),
      this.unreadCount(userId),
    ]);
    return { items: rows.map(toItem), unreadCount };
  }

  unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (count === 0) {
      const exists = await this.prisma.notification.findFirst({ where: { id, userId } });
      if (!exists) throw new NotFoundException('Notification not found');
    }
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}

function toItem(n: Notification): NotificationItem {
  return {
    id: n.id,
    type: n.type as NotificationType,
    title: n.title,
    body: n.body,
    link: n.link,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  };
}
