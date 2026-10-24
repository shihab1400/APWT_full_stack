import { Module } from '@nestjs/common';
import { ConsultationsController } from './consultations.controller.js';
import { ConsultationsService } from './consultations.service.js';
import { MessagingController } from './messaging.controller.js';
import { MessagingService } from './messaging.service.js';

@Module({
  controllers: [ConsultationsController, MessagingController],
  providers: [ConsultationsService, MessagingService],
})
export class ConsultationsModule {}
