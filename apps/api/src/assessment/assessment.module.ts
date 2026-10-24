import { Module } from '@nestjs/common';
import { DoctorsModule } from '../doctors/doctors.module.js';
import { AssessmentController } from './assessment.controller.js';
import { AssessmentService } from './assessment.service.js';
import { QuizAdminController } from './quiz-admin.controller.js';
import { QuizAdminService } from './quiz-admin.service.js';

@Module({
  imports: [DoctorsModule],
  controllers: [AssessmentController, QuizAdminController],
  providers: [AssessmentService, QuizAdminService],
})
export class AssessmentModule {}
