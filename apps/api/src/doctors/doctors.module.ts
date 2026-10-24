import { Module } from '@nestjs/common';
import { AdminDoctorsController, DoctorProfileController } from './doctor-profile.controller.js';
import { DoctorProfileService } from './doctor-profile.service.js';
import { DoctorsController } from './doctors.controller.js';
import { DoctorsService } from './doctors.service.js';
import { LicenseStorage } from './license-storage.js';

@Module({
  controllers: [DoctorsController, DoctorProfileController, AdminDoctorsController],
  providers: [DoctorsService, DoctorProfileService, LicenseStorage],
  exports: [DoctorsService],
})
export class DoctorsModule {}
