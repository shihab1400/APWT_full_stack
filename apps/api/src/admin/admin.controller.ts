import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ACCESS_TOKEN_COOKIE, followUpSchema, type FollowUpDto } from '@mindease/shared';
import { DAY_MS } from '../common/dhaka-time.js';
import { CurrentUser, Roles, type RequestUser } from '../common/decorators.js';
import { ZodValidationPipe, openApiSchema } from '../common/zod.js';
import { AdminService } from './admin.service.js';

const setStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'DEACTIVATED']),
  reason: z.string().trim().min(3, { error: 'A reason is required' }).max(500),
});
type SetStatusDto = z.infer<typeof setStatusSchema>;

const setHandledSchema = z.object({ handled: z.boolean() });

const userQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  role: z.enum(['USER', 'DOCTOR', 'ADMIN']).optional(),
  status: z.enum(['ACTIVE', 'DEACTIVATED']).optional(),
});
type UserQuery = z.infer<typeof userQuerySchema>;

const riskQuerySchema = z.object({
  severity: z.enum(['LOW', 'MODERATE', 'HIGH']).optional(),
  open: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
type RiskQuery = z.infer<typeof riskQuerySchema>;

const auditQuerySchema = z.object({
  action: z.string().max(60).optional(),
  actorId: z.uuid().optional(),
  /** Dhaka calendar dates, inclusive. */
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
type AuditQuery = z.infer<typeof auditQuerySchema>;

const dhakaMidnight = (date: string) => new Date(`${date}T00:00:00+06:00`);
type SetHandledDto = z.infer<typeof setHandledSchema>;

@ApiTags('admin')
@ApiCookieAuth(ACCESS_TOKEN_COOKIE)
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  @ApiOperation({ summary: 'Accounts, searchable by name or email and filterable by role and status' })
  listUsers(@Query(new ZodValidationPipe(userQuerySchema)) q: UserQuery) {
    return this.admin.listUsers({ q: q.q || undefined, role: q.role, status: q.status });
  }

  @Get('risk-alerts')
  @ApiOperation({ summary: 'High-risk users flagged by assessments or AI chat (FR #20)' })
  riskAlerts(@Query(new ZodValidationPipe(riskQuerySchema)) q: RiskQuery) {
    return this.admin.listRiskAlerts(q);
  }

  @Post('risk-alerts/:id/follow-up')
  @ApiOperation({ summary: 'Record how an alert was followed up (audited)' })
  @ApiBody({ schema: openApiSchema(followUpSchema) })
  followUp(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(followUpSchema)) dto: FollowUpDto,
  ) {
    return this.admin.followUpRiskAlert(actor.id, id, dto.note);
  }

  @Get('audit-logs')
  @ApiOperation({ summary: 'Administrative actions with admin ID and timestamp (FR #24)' })
  auditLogs(@Query(new ZodValidationPipe(auditQuerySchema)) q: AuditQuery) {
    return this.admin.auditLog({
      action: q.action || undefined,
      actorId: q.actorId,
      from: q.from ? dhakaMidnight(q.from) : undefined,
      to: q.to ? new Date(dhakaMidnight(q.to).getTime() + DAY_MS) : undefined,
    });
  }

  @Patch('users/:id/status')
  @ApiOperation({ summary: 'Activate or deactivate an account (audited)' })
  @ApiBody({ schema: openApiSchema(setStatusSchema) })
  setStatus(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setStatusSchema)) dto: SetStatusDto,
  ) {
    return this.admin.setStatus(actor.id, id, dto.status, dto.reason);
  }

  @Get('contact-messages')
  @ApiOperation({ summary: 'Support inbox from the public contact form' })
  listContactMessages() {
    return this.admin.listContactMessages();
  }

  @Patch('contact-messages/:id')
  @ApiOperation({ summary: 'Mark a support message handled or open' })
  @ApiBody({ schema: openApiSchema(setHandledSchema) })
  setHandled(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setHandledSchema)) dto: SetHandledDto,
  ) {
    return this.admin.setContactHandled(actor.id, id, dto.handled);
  }
}
