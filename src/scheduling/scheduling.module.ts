import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonAuthModule } from '../common/auth/common-auth.module';
import { User } from '../users/entities/user.entity';

import { Appointment } from './entities/appointment.entity';
import { AppointmentSlot } from './entities/appointment-slot.entity';
import { InspectionStationDailyCapacity } from './entities/inspection-station-daily-capacity.entity';
import { InspectionStation } from './entities/inspection-station.entity';
import { InspectionServiceClosure } from './entities/inspection-service-closure.entity';
import { AdminSchedulingController } from './admin-scheduling.controller';
import { AppointmentsController } from './appointments.controller';
import { InspectionStationDailyCapacityService } from './inspection-station-daily-capacity.service';
import { CitizenSchedulingAvailabilityService } from './citizen-scheduling-availability.service';
import { CitizenPreferredSchedulingService } from './citizen-preferred-scheduling.service';
import { SchedulingService } from './scheduling.service';
import { StationsController } from './stations.controller';
import { InspectionCalendarController } from './inspection-calendar.controller';
import { InspectionCalendarService } from './inspection-calendar.service';

@Module({
  imports: [
    CommonAuthModule,
    TypeOrmModule.forFeature([
      InspectionStation,
      InspectionServiceClosure,
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
    InspectionCalendarController,
  ],
  providers: [
    SchedulingService,
    InspectionStationDailyCapacityService,
    CitizenSchedulingAvailabilityService,
    CitizenPreferredSchedulingService,
    InspectionCalendarService,
  ],
  exports: [
    CitizenSchedulingAvailabilityService,
    CitizenPreferredSchedulingService,
    InspectionStationDailyCapacityService,
    InspectionCalendarService,
  ],
})
export class SchedulingModule {}
