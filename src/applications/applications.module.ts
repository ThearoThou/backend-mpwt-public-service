import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CommonAuthModule } from '../common/auth/common-auth.module';
import { FilesModule } from '../files/files.module';
import { PaymentsModule } from '../payments/payments.module';
import { User } from '../users/entities/user.entity';
import { ApplicationDocument } from './entities/application-document.entity';
import { RenewalApplicationStatusHistory } from './entities/renewal-application-status-history.entity';
import { RenewalApplication } from './entities/renewal-application.entity';
import { AdminApplicationsController } from './admin-applications.controller';
import { AdminApplicationsService } from './admin-applications.service';
import { AdminApplicationDocumentsController } from './admin-application-documents.controller';
import { AdminApplicationDocumentsService } from './admin-application-documents.service';
import { AdminApplicationReviewController } from './admin-application-review.controller';
import { AdminApplicationReviewService } from './admin-application-review.service';
import { ApplicationDocumentsController } from './application-documents.controller';
import { ApplicationsService } from './applications.service';
import { CitizenApplicationsController } from './citizen-applications.controller';
import { ApplicationWorkflowService } from './application-workflow.service';
import { ApplicationDocumentsService } from './application-documents.service';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { CitizenSchedulingPreferenceService } from './citizen-scheduling-preference.service';
import { RenewAgainService } from './renew-again.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RenewalApplication,
      ApplicationDocument,
      RenewalApplicationStatusHistory,
      User,
    ]),
    CommonAuthModule,
    FilesModule,
    SchedulingModule,
    PaymentsModule,
  ],
  controllers: [
    CitizenApplicationsController,
    AdminApplicationsController,
    AdminApplicationDocumentsController,
    AdminApplicationReviewController,
    ApplicationDocumentsController,
  ],
  providers: [
    ApplicationsService,
    AdminApplicationsService,
    AdminApplicationDocumentsService,
    AdminApplicationReviewService,
    ApplicationWorkflowService,
    ApplicationDocumentsService,
    CitizenSchedulingPreferenceService,
    RenewAgainService,
  ],
})
export class ApplicationsModule {}
