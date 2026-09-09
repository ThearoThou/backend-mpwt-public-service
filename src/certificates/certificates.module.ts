import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TechnicalInspectionCertificate } from './entities/technical-inspection-certificate.entity';
import { RenewalApplication } from '../applications/entities/renewal-application.entity';
import { CertificatePdfService } from './certificate-pdf.service';
import { CommonAuthModule } from '../common/auth/common-auth.module';
import { FilesModule } from '../files/files.module';
import { User } from '../users/entities/user.entity';
import { Inspection } from '../inspections/entities/inspection.entity';
import { AdminCertificatesController } from './admin-certificates.controller';
import { CitizenCertificatesController } from './citizen-certificates.controller';
import { CertificateIssuanceService } from './certificate-issuance.service';
import { CertificateReadsService } from './certificate-reads.service';

@Module({
  imports: [
    CommonAuthModule,
    FilesModule,
    TypeOrmModule.forFeature([
      TechnicalInspectionCertificate,
      RenewalApplication,
      Inspection,
      User,
    ]),
  ],
  controllers: [AdminCertificatesController, CitizenCertificatesController],
  providers: [
    CertificatePdfService,
    CertificateIssuanceService,
    CertificateReadsService,
  ],
  exports: [CertificatePdfService],
})
export class CertificatesModule {}
