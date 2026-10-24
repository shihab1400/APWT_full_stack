import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ACCESS_TOKEN_COOKIE,
  createBlockSchema,
  weeklyAvailabilitySchema,
  type CreateBlockDto,
  type WeeklyAvailabilityDto,
} from '@mindease/shared';
import { CurrentUser, Public, Roles, type RequestUser } from '../common/decorators.js';
import { ZodValidationPipe, openApiSchema } from '../common/zod.js';
import { AvailabilityService } from './availability.service.js';

@ApiTags('doctor')
@ApiCookieAuth(ACCESS_TOKEN_COOKIE)
@Roles('DOCTOR')
@Controller('doctor/schedule')
export class DoctorScheduleController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get()
  @ApiOperation({ summary: 'My weekly hours, blocked periods and upcoming slots' })
  get(@CurrentUser() user: RequestUser) {
    return this.availability.schedule(user.id);
  }

  @Put('weekly')
  @ApiOperation({ summary: 'Replace my weekly hours (Dhaka time)' })
  @ApiBody({ schema: openApiSchema(weeklyAvailabilitySchema) })
  setWeekly(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(weeklyAvailabilitySchema)) dto: WeeklyAvailabilityDto,
  ) {
    return this.availability.setWeekly(user.id, dto.windows);
  }

  @Post('blocks')
  @ApiOperation({ summary: 'Block a period so patients cannot book it' })
  @ApiBody({ schema: openApiSchema(createBlockSchema) })
  addBlock(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createBlockSchema)) dto: CreateBlockDto,
  ) {
    return this.availability.addBlock(user.id, dto);
  }

  @Delete('blocks/:id')
  @ApiOperation({ summary: 'Re-open a blocked period' })
  removeBlock(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.availability.removeBlock(user.id, id);
  }
}

@ApiTags('doctors')
@Controller('doctors')
export class DoctorSlotsController {
  constructor(private readonly availability: AvailabilityService) {}

  @Public()
  @Get(':id/slots')
  @ApiOperation({ summary: "A verified doctor's open slots for the next 14 days" })
  slots(@Param('id', ParseUUIDPipe) id: string) {
    return this.availability.publicSlots(id);
  }
}
