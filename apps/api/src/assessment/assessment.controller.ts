import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ACCESS_TOKEN_COOKIE,
  submitAttemptSchema,
  type SubmitAttemptDto,
} from '@mindease/shared';
import { CurrentUser, Roles, type RequestUser } from '../common/decorators.js';
import { ZodValidationPipe, openApiSchema } from '../common/zod.js';
import { AssessmentService } from './assessment.service.js';

@ApiTags('assessment')
@ApiCookieAuth(ACCESS_TOKEN_COOKIE)
@Roles('USER')
@Controller('assessment')
export class AssessmentController {
  constructor(private readonly assessment: AssessmentService) {}

  @Get('quizzes')
  @ApiOperation({ summary: 'Active self-assessments' })
  list() {
    return this.assessment.listQuizzes();
  }

  @Get('quizzes/:id')
  @ApiOperation({ summary: 'Questions and option labels for one assessment' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.assessment.getQuiz(id);
  }

  @Post('quizzes/:id/attempts')
  @ApiOperation({ summary: 'Submit answers; returns the score, risk level and recommendations' })
  @ApiBody({ schema: openApiSchema(submitAttemptSchema) })
  submit(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(submitAttemptSchema)) dto: SubmitAttemptDto,
  ) {
    return this.assessment.submit(user.id, id, dto.answers);
  }

  @Get('attempts')
  @ApiOperation({ summary: 'My past results, newest first' })
  history(@CurrentUser() user: RequestUser) {
    return this.assessment.history(user.id);
  }
}
