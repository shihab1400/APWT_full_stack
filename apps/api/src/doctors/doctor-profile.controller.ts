import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import {
  ACCESS_TOKEN_COOKIE,
  LICENSE_MAX_BYTES,
  doctorProfileSchema,
  rejectDoctorSchema,
  type DoctorProfileDto,
  type DoctorProfileStatus,
  type RejectDoctorDto,
} from '@mindease/shared';
import { CurrentUser, Roles, type RequestUser } from '../common/decorators.js';
import { ZodValidationPipe, openApiSchema } from '../common/zod.js';
import { DoctorProfileService } from './doctor-profile.service.js';
import type { UploadedFileLike } from './license-storage.js';

const EXTENSION: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

function licenseFile({ stream, mimeType }: { stream: NodeJS.ReadableStream; mimeType: string }) {
  return new StreamableFile(stream as never, {
    type: mimeType,
    disposition: `inline; filename="licence.${EXTENSION[mimeType] ?? 'bin'}"`,
  });
}

@ApiTags('doctor')
@ApiCookieAuth(ACCESS_TOKEN_COOKIE)
@Roles('DOCTOR')
@Controller('doctor/profile')
export class DoctorProfileController {
  constructor(private readonly profiles: DoctorProfileService) {}

  @Get()
  @ApiOperation({ summary: 'My professional profile and verification status' })
  get(@CurrentUser() user: RequestUser) {
    return this.profiles.getOwn(user.id);
  }

  @Put()
  @ApiOperation({ summary: 'Update my professional profile' })
  @ApiBody({ schema: openApiSchema(doctorProfileSchema) })
  update(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(doctorProfileSchema)) dto: DoctorProfileDto,
  ) {
    return this.profiles.updateOwn(user.id, dto);
  }

  @Post('license')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: LICENSE_MAX_BYTES, files: 1 } }))
  @ApiOperation({ summary: 'Upload my licence (PDF, PNG or JPG, up to 5 MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  upload(@CurrentUser() user: RequestUser, @UploadedFile() file: UploadedFileLike | undefined) {
    return this.profiles.uploadLicense(user.id, file);
  }

  @Get('license')
  @ApiOperation({ summary: 'View my uploaded licence' })
  async license(@CurrentUser() user: RequestUser) {
    return licenseFile(await this.profiles.ownLicense(user.id));
  }

  @Post('submit')
  @ApiOperation({ summary: 'Submit my profile for admin verification' })
  submit(@CurrentUser() user: RequestUser) {
    return this.profiles.submit(user.id);
  }
}

const statusQuery = z.enum(['INCOMPLETE', 'SUBMITTED', 'APPROVED', 'REJECTED']).optional();

@ApiTags('admin')
@ApiCookieAuth(ACCESS_TOKEN_COOKIE)
@Roles('ADMIN')
@Controller('admin/doctors')
export class AdminDoctorsController {
  constructor(private readonly profiles: DoctorProfileService) {}

  @Get()
  @ApiOperation({ summary: 'Doctor profiles, optionally filtered by verification status' })
  @ApiQuery({ name: 'status', required: false, enum: statusQuery.unwrap().options })
  list(@Query('status', new ZodValidationPipe(statusQuery)) status?: DoctorProfileStatus) {
    return this.profiles.adminList(status);
  }

  @Get(':id/license')
  @ApiOperation({ summary: "View a doctor's uploaded licence" })
  async license(@Param('id', ParseUUIDPipe) id: string) {
    return licenseFile(await this.profiles.adminLicense(id));
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Verify a submitted profile; it becomes public and bookable (audited)' })
  async approve(@CurrentUser() actor: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.profiles.approve(actor.id, id);
    return { ok: true };
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Send a submitted profile back with a reason (audited)' })
  @ApiBody({ schema: openApiSchema(rejectDoctorSchema) })
  async reject(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(rejectDoctorSchema)) dto: RejectDoctorDto,
  ) {
    await this.profiles.reject(actor.id, id, dto.reason);
    return { ok: true };
  }
}
