import { Module } from '@nestjs/common';
import { DoctorScheduleController, DoctorSlotsController } from './availability.controller.js';
import { AvailabilityService } from './availability.service.js';

@Module({
  controllers: [DoctorScheduleController, DoctorSlotsController],
  providers: [AvailabilityService],
  exports: [AvailabilityService],
})
export class SchedulingModule {}
