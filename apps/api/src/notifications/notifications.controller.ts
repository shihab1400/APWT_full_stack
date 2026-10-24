import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ACCESS_TOKEN_COOKIE, type NotificationStreamEvent } from '@mindease/shared';
import { CurrentUser, type RequestUser } from '../common/decorators.js';
import { NotificationsService } from './notifications.service.js';

const HEARTBEAT_MS = 25_000;
/**
 * Streams end after this long so the client reconnects through the auth guard,
 * picking up a refreshed token or a deactivated account.
 */
const MAX_STREAM_MS = 10 * 60_000;

@ApiTags('notifications')
@ApiCookieAuth(ACCESS_TOKEN_COOKIE)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'My latest notifications and unread count' })
  list(@CurrentUser() user: RequestUser) {
    return this.notifications.list(user.id);
  }

  @Patch(':id/read')
  @HttpCode(204)
  @ApiOperation({ summary: 'Mark one notification read' })
  async read(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.notifications.markRead(user.id, id);
  }

  @Post('read-all')
  @HttpCode(204)
  @ApiOperation({ summary: 'Mark all my notifications read' })
  async readAll(@CurrentUser() user: RequestUser) {
    await this.notifications.markAllRead(user.id);
  }

  @SkipThrottle()
  @Get('stream')
  @ApiOperation({
    summary: 'Real-time notifications (Server-Sent Events)',
    description: 'Sends `ready` with the unread count, then `notification` for each new one.',
  })
  @ApiProduces('text/event-stream')
  async stream(@CurrentUser() user: RequestUser, @Res() res: Response): Promise<void> {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const emit = (e: NotificationStreamEvent) => {
      if (!res.writableEnded) res.write(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`);
    };

    // Subscribe before counting so nothing created in between is missed.
    const sub = this.notifications
      .stream(user.id)
      .subscribe((item) => emit({ event: 'notification', data: item }));
    const heartbeat = setInterval(() => !res.writableEnded && res.write(': ping\n\n'), HEARTBEAT_MS);
    const close = () => {
      clearInterval(heartbeat);
      clearTimeout(expiry);
      sub.unsubscribe();
      if (!res.writableEnded) res.end();
    };
    const expiry = setTimeout(close, MAX_STREAM_MS);
    res.on('close', close);

    emit({ event: 'ready', data: { unreadCount: await this.notifications.unreadCount(user.id) } });
  }
}
