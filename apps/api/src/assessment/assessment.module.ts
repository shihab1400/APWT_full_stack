import { Module } from '@nestjs/common';
import { DoctorsModule } from '../doctors/doctors.module.js';
import { AssessmentController } from './assessment.controller.js';
import { AssessmentService } from './assessment.service.js';

@Module({
  imports: [DoctorsModule],
  controllers: [AssessmentController],
  providers: [AssessmentService],
})
export class AssessmentModule {}
