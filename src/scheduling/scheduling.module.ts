import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Appointment } from './entities/appointment.entity';
import { AppointmentSlot } from './entities/appointment-slot.entity';
import { InspectionStation } from './entities/inspection-station.entity';
import { AdminSchedulingController } from './admin-scheduling.controller';
import { AppointmentsController } from './appointments.controller';
import { SchedulingService } from './scheduling.service';
import { StationsController } from './stations.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([InspectionStation, AppointmentSlot, Appointment]),
  ],
  controllers: [
    StationsController,
    AppointmentsController,
    AdminSchedulingController,
  ],
  providers: [SchedulingService],
})
export class SchedulingModule {}
