import { Module } from '@nestjs/common';
import { SchedulingModule } from '../scheduling/scheduling.module.js';
import {
  AdminAppointmentsController,
  DoctorAppointmentsController,
  PatientAppointmentsController,
} from './appointments.controller.js';
import { AppointmentsService } from './appointments.service.js';
import { RemindersService } from './reminders.service.js';

@Module({
  imports: [SchedulingModule],
  controllers: [
    PatientAppointmentsController,
    DoctorAppointmentsController,
    AdminAppointmentsController,
  ],
  providers: [AppointmentsService, RemindersService],
})
export class AppointmentsModule {}
