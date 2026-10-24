import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import {
  ACCESS_TOKEN_COOKIE,
  sendChatMessageSchema,
  type ChatStreamEvent,
  type SendChatMessageDto,
} from '@mindease/shared';
import { CurrentUser, Roles, type RequestUser } from '../common/decorators.js';
import { ZodValidationPipe, openApiSchema } from '../common/zod.js';
import { ChatService } from './chat.service.js';

@ApiTags('chat')
@ApiCookieAuth(ACCESS_TOKEN_COOKIE)
@Roles('USER')
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('usage')
  @ApiOperation({ summary: "Today's message count and the daily limit (null = unlimited)" })
  usage(@CurrentUser() user: RequestUser) {
    return this.chat.usage(user);
  }

  @Get('sessions')
  @ApiOperation({ summary: 'My conversations, most recent first' })
  sessions(@CurrentUser() user: RequestUser) {
    return this.chat.listSessions(user.id);
  }

  @Get('sessions/:id/messages')
  @ApiOperation({ summary: 'Messages in one of my conversations' })
  messages(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.chat.messages(user.id, id);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete one of my conversations' })
  async remove(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.chat.deleteSession(user.id, id);
  }

  @Post('messages')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Send a message and stream the reply',
    description:
      'Responds with Server-Sent Events: session, optional crisis, delta (repeated), then done or error. ' +
      'Returns 429 with code CHAT_LIMIT_REACHED when a free user is out of messages.',
  })
  @ApiProduces('text/event-stream')
  @ApiBody({ schema: openApiSchema(sendChatMessageSchema) })
  async send(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(sendChatMessageSchema)) dto: SendChatMessageDto,
    @Res() res: Response,
  ): Promise<void> {
    // Errors here (validation, 404, daily limit) go out as ordinary JSON responses.
    const turn = await this.chat.prepare(user, dto);

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const abort = new AbortController();
    res.on('close', () => abort.abort());
    const emit = (e: ChatStreamEvent) => {
      if (!res.writableEnded) res.write(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`);
    };

    try {
      await this.chat.respond(turn, user, emit, abort.signal);
    } catch {
      emit({ event: 'error', data: { message: 'Something went wrong. Please try again.' } });
    } finally {
      res.end();
    }
  }
}
