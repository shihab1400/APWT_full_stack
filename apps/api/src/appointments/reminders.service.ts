import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { APPOINTMENT_TYPE_LABEL, REMINDER_MINUTES_BEFORE } from '@mindease/shared';
import { formatDhaka } from '../common/dhaka-time.js';
import { ENV, type Env } from '../config/env.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DOCTOR_LINK, PATIENT_LINK } from './appointments.service.js';

const TICK_MS = 60_000;
export const EXPIRED_REASON = 'The doctor did not respond before the session time';

/**
 * Once a minute: sends the 15-minute session reminder to both parties and
 * closes requests the doctor never answered. Tests call tick() directly.
 */
@Injectable()
export class RemindersService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(RemindersService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onApplicationBootstrap() {
    if (this.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => {
      this.tick().catch((err: unknown) => this.logger.error(`Reminder tick failed: ${String(err)}`));
    }, TICK_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async tick(now = new Date()): Promise<{ reminded: number; expired: number }> {
    return { reminded: await this.sendReminders(now), expired: await this.expireRequests(now) };
  }

  private async sendReminders(now: Date): Promise<number> {
    const due = await this.prisma.appointment.findMany({
      where: {
        status: 'ACCEPTED',
        reminderSent: false,
        startsAt: { gt: now, lte: new Date(now.getTime() + REMINDER_MINUTES_BEFORE * 60_000) },
      },
      include: {
        doctor: { select: { userId: true, user: { select: { name: true } } } },
        patient: { select: { name: true } },
      },
    });

    let sent = 0;
    for (const a of due) {
      // Claim the reminder first so a parallel tick can't send it twice.
      const { count } = await this.prisma.appointment.updateMany({
        where: { id: a.id, reminderSent: false },
        data: { reminderSent: true },
      });
      if (!count) continue;
      const minutes = Math.max(1, Math.round((a.startsAt.getTime() - now.getTime()) / 60_000));
      const when = `${APPOINTMENT_TYPE_LABEL[a.type]} · ${formatDhaka(a.startsAt)}`;
      await this.notifications.notify(a.patientId, {
        type: 'APPOINTMENT_REMINDER',
        title: `Your session with ${a.doctor.user.name} starts in ${minutes} minutes`,
        body: when,
        email: true,
        link: PATIENT_LINK,
      });
      await this.notifications.notify(a.doctor.userId, {
        type: 'APPOINTMENT_REMINDER',
        title: `Session with ${a.patient.name} starts in ${minutes} minutes`,
        body: when,
        email: true,
        link: DOCTOR_LINK,
      });
      sent++;
    }
    return sent;
  }

  private async expireRequests(now: Date): Promise<number> {
    const stale = await this.prisma.appointment.findMany({
      where: { status: 'REQUESTED', startsAt: { lte: now } },
      include: { doctor: { select: { user: { select: { name: true } } } } },
    });

    let expired = 0;
    for (const a of stale) {
      const { count } = await this.prisma.appointment.updateMany({
        where: { id: a.id, status: 'REQUESTED' },
        data: { status: 'CANCELLED', cancelReason: EXPIRED_REASON },
      });
      if (!count) continue;
      await this.notifications.notify(a.patientId, {
        type: 'APPOINTMENT_EXPIRED',
        title: `Your request to ${a.doctor.user.name} expired`,
        body: `${formatDhaka(a.startsAt)}. ${EXPIRED_REASON}. Please choose another time.`,
        email: true,
        link: PATIENT_LINK,
      });
      expired++;
    }
    return expired;
  }
}
