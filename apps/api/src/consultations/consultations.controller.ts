import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ACCESS_TOKEN_COOKIE,
  consultationNoteSchema,
  type ConsultationNoteDto,
} from '@mindease/shared';
import { CurrentUser, Roles, type RequestUser } from '../common/decorators.js';
import { ZodValidationPipe, openApiSchema } from '../common/zod.js';
import { ConsultationsService } from './consultations.service.js';

@ApiTags('doctor')
@ApiCookieAuth(ACCESS_TOKEN_COOKIE)
@Roles('DOCTOR')
@Controller('doctor')
export class ConsultationsController {
  constructor(private readonly consultations: ConsultationsService) {}

  @Get('patients')
  @ApiOperation({ summary: 'My patients with their latest shared assessment' })
  patients(@CurrentUser() user: RequestUser) {
    return this.consultations.patients(user.id);
  }

  @Get('patients/:id')
  @ApiOperation({ summary: 'One patient: shared assessments, sessions with me and my notes' })
  patient(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.consultations.patient(user.id, id);
  }

  @Post('appointments/:id/notes')
  @ApiOperation({ summary: 'Add a private consultation note to a session' })
  @ApiBody({ schema: openApiSchema(consultationNoteSchema) })
  addNote(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(consultationNoteSchema)) dto: ConsultationNoteDto,
  ) {
    return this.consultations.addNote(user.id, id, dto.body);
  }

  @Patch('notes/:id')
  @ApiOperation({ summary: 'Update one of my consultation notes' })
  @ApiBody({ schema: openApiSchema(consultationNoteSchema) })
  updateNote(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(consultationNoteSchema)) dto: ConsultationNoteDto,
  ) {
    return this.consultations.updateNote(user.id, id, dto.body);
  }

  @Get('earnings')
  @ApiOperation({ summary: 'Completed, paid consultations and totals' })
  earnings(@CurrentUser() user: RequestUser) {
    return this.consultations.earnings(user.id);
  }
}
