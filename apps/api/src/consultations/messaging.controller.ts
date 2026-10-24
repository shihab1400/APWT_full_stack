import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  ACCESS_TOKEN_COOKIE,
  sendConsultationMessageSchema,
  type SendConsultationMessageDto,
} from '@mindease/shared';
import { CurrentUser, Roles, type RequestUser } from '../common/decorators.js';
import { ZodValidationPipe, openApiSchema } from '../common/zod.js';
import { MessagingService } from './messaging.service.js';

@ApiTags('consultations')
@ApiCookieAuth(ACCESS_TOKEN_COOKIE)
@Roles('USER', 'DOCTOR')
@Controller('consultations')
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Get()
  @ApiOperation({ summary: 'My online consultation chats with unread counts' })
  list(@CurrentUser() user: RequestUser) {
    return this.messaging.list(user.id);
  }

  @Get('unread')
  @ApiOperation({ summary: 'Total unread consultation messages' })
  unread(@CurrentUser() user: RequestUser) {
    return this.messaging.unread(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One consultation chat (marks incoming messages read)' })
  thread(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.messaging.thread(user.id, id);
  }

  @Post(':id/read')
  @HttpCode(204)
  @ApiOperation({ summary: 'Mark incoming messages in a chat as read' })
  async read(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.messaging.read(user.id, id);
  }

  @Post(':id/messages')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Send a message while the session chat is open' })
  @ApiBody({ schema: openApiSchema(sendConsultationMessageSchema) })
  send(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(sendConsultationMessageSchema)) dto: SendConsultationMessageDto,
  ) {
    return this.messaging.send(user.id, id, dto.body);
  }
}
