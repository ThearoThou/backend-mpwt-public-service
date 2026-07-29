import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ApplicationDocument } from './entities/application-document.entity';
import { RenewalApplication } from './entities/renewal-application.entity';
import { AdminApplicationsController } from './admin-applications.controller';
import { ApplicationDocumentsController } from './application-documents.controller';
import { ApplicationsService } from './applications.service';
import { CitizenApplicationsController } from './citizen-applications.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([RenewalApplication, ApplicationDocument]),
  ],
  controllers: [
    CitizenApplicationsController,
    AdminApplicationsController,
    ApplicationDocumentsController,
  ],
  providers: [ApplicationsService],
})
export class ApplicationsModule {}
