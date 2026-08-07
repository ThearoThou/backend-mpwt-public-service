import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CommonAuthModule } from '../common/auth/common-auth.module';
import { User } from '../users/entities/user.entity';
import { ApplicationDocument } from './entities/application-document.entity';
import { RenewalApplicationStatusHistory } from './entities/renewal-application-status-history.entity';
import { RenewalApplication } from './entities/renewal-application.entity';
import { AdminApplicationsController } from './admin-applications.controller';
import { ApplicationDocumentsController } from './application-documents.controller';
import { ApplicationsService } from './applications.service';
import { CitizenApplicationsController } from './citizen-applications.controller';
import { ApplicationWorkflowService } from './application-workflow.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RenewalApplication,
      ApplicationDocument,
      RenewalApplicationStatusHistory,
      User,
    ]),
    CommonAuthModule,
  ],
  controllers: [
    CitizenApplicationsController,
    AdminApplicationsController,
    ApplicationDocumentsController,
  ],
  providers: [ApplicationsService, ApplicationWorkflowService],
})
export class ApplicationsModule {}
