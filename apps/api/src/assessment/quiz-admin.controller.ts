import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ACCESS_TOKEN_COOKIE,
  createQuizSchema,
  quizQuestionSchema,
  quizSettingsSchema,
  type CreateQuizDto,
  type QuizQuestionDto,
  type QuizSettingsDto,
} from '@mindease/shared';
import { CurrentUser, Roles, type RequestUser } from '../common/decorators.js';
import { ZodValidationPipe, openApiSchema } from '../common/zod.js';
import { QuizAdminService } from './quiz-admin.service.js';

@ApiTags('admin')
@ApiCookieAuth(ACCESS_TOKEN_COOKIE)
@Roles('ADMIN')
@Controller('admin/quizzes')
export class QuizAdminController {
  constructor(private readonly quizzes: QuizAdminService) {}

  @Get()
  @ApiOperation({ summary: 'All assessments with questions, option scores and thresholds' })
  list() {
    return this.quizzes.list();
  }

  @Post()
  @ApiOperation({ summary: 'Create a new (unpublished) assessment' })
  @ApiBody({ schema: openApiSchema(createQuizSchema) })
  create(@CurrentUser() actor: RequestUser, @Body(new ZodValidationPipe(createQuizSchema)) dto: CreateQuizDto) {
    return this.quizzes.create(actor.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update title, thresholds or publish state (audited as QUIZ_MODIFIED)' })
  @ApiBody({ schema: openApiSchema(quizSettingsSchema) })
  update(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(quizSettingsSchema)) dto: QuizSettingsDto,
  ) {
    return this.quizzes.updateSettings(actor.id, id, dto);
  }

  @Post(':id/questions')
  @ApiOperation({ summary: 'Add a question at the end' })
  @ApiBody({ schema: openApiSchema(quizQuestionSchema) })
  addQuestion(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(quizQuestionSchema)) dto: QuizQuestionDto,
  ) {
    return this.quizzes.addQuestion(actor.id, id, dto);
  }

  @Patch(':id/questions/:questionId')
  @ApiOperation({ summary: 'Edit a question and its options' })
  @ApiBody({ schema: openApiSchema(quizQuestionSchema) })
  updateQuestion(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body(new ZodValidationPipe(quizQuestionSchema)) dto: QuizQuestionDto,
  ) {
    return this.quizzes.updateQuestion(actor.id, id, questionId, dto);
  }

  @Delete(':id/questions/:questionId')
  @ApiOperation({ summary: 'Remove a question' })
  deleteQuestion(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
  ) {
    return this.quizzes.deleteQuestion(actor.id, id, questionId);
  }
}
