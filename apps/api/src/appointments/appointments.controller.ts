import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  ACCESS_TOKEN_COOKIE,
  AppointmentStatus,
  bookAppointmentSchema,
  cancelAppointmentSchema,
  declineAppointmentSchema,
  shareAssessmentsSchema,
  type BookAppointmentDto,
  type CancelAppointmentDto,
  type DeclineAppointmentDto,
  type ShareAssessmentsDto,
} from '@mindease/shared';
import { DAY_MS } from '../common/dhaka-time.js';
import { CurrentUser, Roles, type RequestUser } from '../common/decorators.js';
import { ZodValidationPipe, openApiSchema } from '../common/zod.js';
import { AppointmentsService } from './appointments.service.js';

@ApiTags('appointments')
@ApiCookieAuth(ACCESS_TOKEN_COOKIE)
@Roles('USER')
@Controller('appointments')
export class PatientAppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  @ApiOperation({ summary: 'My appointments, newest first' })
  list(@CurrentUser() user: RequestUser) {
    return this.appointments.listForPatient(user.id);
  }

  @Post()
  @ApiOperation({
    summary: 'Request an open slot (Premium)',
    description:
      'Returns 403 PREMIUM_REQUIRED for free users and 409 SLOT_UNAVAILABLE when the slot is ' +
      'outside the doctor’s hours, blocked or already taken.',
  })
  @ApiBody({ schema: openApiSchema(bookAppointmentSchema) })
  book(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(bookAppointmentSchema)) dto: BookAppointmentDto,
  ) {
    return this.appointments.book(user, dto);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel one of my upcoming appointments' })
  @ApiBody({ schema: openApiSchema(cancelAppointmentSchema) })
  cancel(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(cancelAppointmentSchema)) dto: CancelAppointmentDto,
  ) {
    return this.appointments.cancelByPatient(user.id, id, dto.reason);
  }

  @Patch(':id/sharing')
  @ApiOperation({ summary: 'Share (or stop sharing) my self-assessment results with this doctor' })
  @ApiBody({ schema: openApiSchema(shareAssessmentsSchema) })
  setSharing(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(shareAssessmentsSchema)) dto: ShareAssessmentsDto,
  ) {
    return this.appointments.setSharing(user.id, id, dto.share);
  }
}

@ApiTags('doctor')
@ApiCookieAuth(ACCESS_TOKEN_COOKIE)
@Roles('DOCTOR')
@Controller('doctor/appointments')
export class DoctorAppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  @ApiOperation({ summary: 'Booking requests and appointments with me' })
  list(@CurrentUser() user: RequestUser) {
    return this.appointments.listForDoctor(user.id);
  }

  @Post(':id/accept')
  @ApiOperation({ summary: 'Confirm a booking request' })
  accept(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.appointments.accept(user.id, id);
  }

  @Post(':id/decline')
  @ApiOperation({ summary: 'Decline a booking request with a reason' })
  @ApiBody({ schema: openApiSchema(declineAppointmentSchema) })
  decline(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(declineAppointmentSchema)) dto: DeclineAppointmentDto,
  ) {
    return this.appointments.decline(user.id, id, dto.reason);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a confirmed appointment (reason required)' })
  @ApiBody({ schema: openApiSchema(cancelAppointmentSchema) })
  cancel(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(cancelAppointmentSchema)) dto: CancelAppointmentDto,
  ) {
    return this.appointments.cancelByDoctor(user.id, id, dto.reason);
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Mark a session as completed' })
  complete(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.appointments.complete(user.id, id);
  }
}

const adminFilterSchema = z.object({
  status: z.enum(Object.values(AppointmentStatus) as [AppointmentStatus]).optional(),
  type: z.enum(['ONLINE', 'OFFLINE']).optional(),
  /** Dhaka calendar dates, inclusive. */
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
type AdminFilterDto = z.infer<typeof adminFilterSchema>;

const dhakaMidnight = (date: string) => new Date(`${date}T00:00:00+06:00`);

@ApiTags('admin')
@ApiCookieAuth(ACCESS_TOKEN_COOKIE)
@Roles('ADMIN')
@Controller('admin/appointments')
export class AdminAppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  @ApiOperation({ summary: 'All appointments, filterable by status, type and date range' })
  list(@Query(new ZodValidationPipe(adminFilterSchema)) q: AdminFilterDto) {
    return this.appointments.adminList({
      status: q.status,
      type: q.type,
      from: q.from ? dhakaMidnight(q.from) : undefined,
      to: q.to ? new Date(dhakaMidnight(q.to).getTime() + DAY_MS) : undefined,
    });
  }
}
