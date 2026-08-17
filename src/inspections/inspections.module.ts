import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonAuthModule } from '../common/auth/common-auth.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { User } from '../users/entities/user.entity';

import { AdminInspectionsController } from './admin-inspections.controller';
import { CitizenApplicationInspectionsController } from './citizen-application-inspections.controller';
import { CitizenInspectionsController } from './citizen-inspections.controller';
import { InspectionCommandsService } from './inspection-commands.service';
import { InspectionExpiryService } from './inspection-expiry.service';
import { InspectionReadsService } from './inspection-reads.service';
import { InspectionReplacementSchedulingService } from './inspection-replacement-scheduling.service';
import { InspectionWorkflowScheduler } from './inspection-workflow.scheduler';
import { InspectionsService } from './inspections.service';

@Module({
  imports: [
    CommonAuthModule,
    SchedulingModule,
    TypeOrmModule.forFeature([User]),
  ],
  controllers: [
    AdminInspectionsController,
    CitizenApplicationInspectionsController,
    CitizenInspectionsController,
  ],
  providers: [
    InspectionsService,
    InspectionReadsService,
    InspectionCommandsService,
    InspectionExpiryService,
    InspectionReplacementSchedulingService,
    InspectionWorkflowScheduler,
  ],
})
export class InspectionsModule {}
