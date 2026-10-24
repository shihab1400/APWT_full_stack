import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  ACCESS_TOKEN_COOKIE,
  moderateReviewSchema,
  reportReviewSchema,
  reviewSchema,
  type ModerateReviewDto,
  type ReportReviewDto,
  type ReviewDto,
  type ReviewStatus,
} from '@mindease/shared';
import { CurrentUser, Public, Roles, type RequestUser } from '../common/decorators.js';
import { ZodValidationPipe, openApiSchema } from '../common/zod.js';
import { ReviewsService } from './reviews.service.js';

@ApiTags('reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Roles('USER')
  @ApiCookieAuth(ACCESS_TOKEN_COOKIE)
  @Post('appointments/:id/review')
  @ApiOperation({ summary: 'Rate a completed session (once per appointment)' })
  @ApiBody({ schema: openApiSchema(reviewSchema) })
  create(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewSchema)) dto: ReviewDto,
  ) {
    return this.reviews.create(user.id, id, dto);
  }

  @Public()
  @Get('doctors/:id/reviews')
  @ApiOperation({ summary: "A verified doctor's reviews, shown anonymously" })
  listPublic(@Param('id', ParseUUIDPipe) id: string) {
    return this.reviews.listPublic(id);
  }

  @Roles('DOCTOR')
  @ApiCookieAuth(ACCESS_TOKEN_COOKIE)
  @Get('doctor/reviews')
  @ApiOperation({ summary: 'Reviews of me' })
  listMine(@CurrentUser() user: RequestUser) {
    return this.reviews.listForDoctor(user.id);
  }

  @Roles('DOCTOR')
  @ApiCookieAuth(ACCESS_TOKEN_COOKIE)
  @Post('doctor/reviews/:id/report')
  @ApiOperation({ summary: 'Report a review to the admins' })
  @ApiBody({ schema: openApiSchema(reportReviewSchema) })
  report(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reportReviewSchema)) dto: ReportReviewDto,
  ) {
    return this.reviews.report(user.id, id, dto.reason);
  }
}

const statusQuery = z.enum(['VISIBLE', 'FLAGGED', 'HIDDEN']).optional();

@ApiTags('admin')
@ApiCookieAuth(ACCESS_TOKEN_COOKIE)
@Roles('ADMIN')
@Controller('admin/reviews')
export class AdminReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  @ApiOperation({ summary: 'Review moderation queue (reported first)' })
  @ApiQuery({ name: 'status', required: false, enum: ['VISIBLE', 'FLAGGED', 'HIDDEN'] })
  list(@Query('status', new ZodValidationPipe(statusQuery)) status?: ReviewStatus) {
    return this.reviews.adminList(status);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Show, flag or hide a review (audited)' })
  @ApiBody({ schema: openApiSchema(moderateReviewSchema) })
  moderate(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(moderateReviewSchema)) dto: ModerateReviewDto,
  ) {
    return this.reviews.moderate(actor.id, id, dto);
  }
}
