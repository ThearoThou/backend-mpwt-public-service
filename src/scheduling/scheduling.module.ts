import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonAuthModule } from '../common/auth/common-auth.module';
import { User } from '../users/entities/user.entity';

import { Appointment } from './entities/appointment.entity';
import { AppointmentSlot } from './entities/appointment-slot.entity';
import { InspectionStationDailyCapacity } from './entities/inspection-station-daily-capacity.entity';
import { InspectionStation } from './entities/inspection-station.entity';
import { AdminSchedulingController } from './admin-scheduling.controller';
import { AppointmentsController } from './appointments.controller';
import { InspectionStationDailyCapacityService } from './inspection-station-daily-capacity.service';
import { CitizenSchedulingAvailabilityService } from './citizen-scheduling-availability.service';
import { SchedulingService } from './scheduling.service';
import { StationsController } from './stations.controller';

@Module({
  imports: [
    CommonAuthModule,
    TypeOrmModule.forFeature([
      InspectionStation,
      InspectionStationDailyCapacity,
      AppointmentSlot,
      Appointment,
      User,
    ]),
  ],
  controllers: [
    StationsController,
    AppointmentsController,
    AdminSchedulingController,
  ],
  providers: [
    SchedulingService,
    InspectionStationDailyCapacityService,
    CitizenSchedulingAvailabilityService,
  ],
  exports: [
    CitizenSchedulingAvailabilityService,
    InspectionStationDailyCapacityService,
  ],
})
export class SchedulingModule {}
