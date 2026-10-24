import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ACCESS_TOKEN_COOKIE } from '@mindease/shared';
import { CurrentUser, Roles, type RequestUser } from '../common/decorators.js';
import { ZodValidationPipe, openApiSchema } from '../common/zod.js';
import { AdminService } from './admin.service.js';

const setStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'DEACTIVATED']),
  reason: z.string().trim().min(3, { error: 'A reason is required' }).max(500),
});
type SetStatusDto = z.infer<typeof setStatusSchema>;

@ApiTags('admin')
@ApiCookieAuth(ACCESS_TOKEN_COOKIE)
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  @ApiOperation({ summary: 'List all accounts' })
  listUsers() {
    return this.admin.listUsers();
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
}
