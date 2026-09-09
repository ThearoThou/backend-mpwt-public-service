import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { RenewalApplication } from '../applications/entities/renewal-application.entity';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { FilesService } from '../files/files.service';
import { Inspection } from '../inspections/entities/inspection.entity';
import { InspectionResult } from '../inspections/enums/inspection-result.enum';
import { InspectionStatus } from '../inspections/enums/inspection-status.enum';
import {
  mapTechnicalInspectionCertificateResponse,
  type TechnicalInspectionCertificateResponse,
} from './certificate-response.mapper';
import { TechnicalInspectionCertificate } from './entities/technical-inspection-certificate.entity';

export interface CertificatePdfDownload {
  content: Buffer;
  filename: string;
  mimeType: 'application/pdf';
}

interface IssuedCertificateFacts {
  certificate: TechnicalInspectionCertificate;
  inspection: Inspection;
}

@Injectable()
export class CertificateReadsService {
  constructor(
    @InjectRepository(RenewalApplication)
    private readonly applications: Repository<RenewalApplication>,
    @InjectRepository(TechnicalInspectionCertificate)
    private readonly certificates: Repository<TechnicalInspectionCertificate>,
    @InjectRepository(Inspection)
    private readonly inspections: Repository<Inspection>,
    private readonly files: FilesService,
  ) {}

  async getCitizenCertificate(
    citizenId: string,
    applicationId: string,
  ): Promise<TechnicalInspectionCertificateResponse> {
    await this.requireApplication(applicationId, citizenId);
    return this.status(applicationId);
  }

  async downloadCitizenCertificate(
    citizenId: string,
    applicationId: string,
  ): Promise<CertificatePdfDownload> {
    await this.requireApplication(applicationId, citizenId);
    return this.download(applicationId);
  }

  async getAdminCertificate(
    applicationId: string,
  ): Promise<TechnicalInspectionCertificateResponse> {
    await this.requireApplication(applicationId);
    return this.status(applicationId);
  }

  async downloadAdminCertificate(
    applicationId: string,
  ): Promise<CertificatePdfDownload> {
    await this.requireApplication(applicationId);
    return this.download(applicationId);
  }

  private async status(
    applicationId: string,
  ): Promise<TechnicalInspectionCertificateResponse> {
    const facts = await this.issuedFacts(applicationId, false);
    if (facts === null) {
      return mapTechnicalInspectionCertificateResponse(null, null);
    }
    return mapTechnicalInspectionCertificateResponse(
      facts.certificate,
      facts.inspection,
    );
  }

  private async download(
    applicationId: string,
  ): Promise<CertificatePdfDownload> {
    const facts = await this.issuedFacts(applicationId, true);
    if (facts === null) throw this.notAvailable();

    try {
      return {
        content: await this.files.read(facts.certificate.artifactFileKey),
        filename: certificateDownloadFilename(
          facts.certificate.certificateNumber,
        ),
        mimeType: 'application/pdf',
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw this.notAvailable();
      }
      throw new DomainException(
        ApiErrorCode.INTERNAL_SERVER_ERROR,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Technical inspection certificate artifact could not be read',
      );
    }
  }

  private async requireApplication(
    applicationId: string,
    citizenId?: string,
  ): Promise<void> {
    const application = await this.applications.findOne({
      where: { id: applicationId },
    });
    if (application === null) throw this.applicationNotFound();
    if (citizenId !== undefined && application.citizenId !== citizenId) {
      throw new DomainException(
        ApiErrorCode.RESOURCE_NOT_OWNED,
        HttpStatus.FORBIDDEN,
        'Renewal application is outside the citizen ownership scope',
      );
    }
  }

  private async issuedFacts(
    applicationId: string,
    required: boolean,
  ): Promise<IssuedCertificateFacts | null> {
    const certificate = await this.certificates.findOne({
      where: { applicationId },
    });
    if (certificate === null) {
      if (required) throw this.notAvailable();
      return null;
    }
    if (
      certificate.applicationId !== applicationId ||
      typeof certificate.artifactFileKey !== 'string' ||
      certificate.artifactFileKey.trim() === ''
    ) {
      throw this.incoherent();
    }

    const inspection = await this.inspections.findOne({
      where: { id: certificate.inspectionId },
    });
    if (
      inspection === null ||
      inspection.applicationId !== applicationId ||
      inspection.id !== certificate.inspectionId ||
      inspection.attemptNumber !== 1 ||
      inspection.status !== InspectionStatus.COMPLETED ||
      inspection.result !== InspectionResult.PASS ||
      inspection.completedAt === null ||
      inspection.validUntil === null
    ) {
      throw this.incoherent();
    }
    return { certificate, inspection };
  }

  private applicationNotFound(): DomainException {
    return new DomainException(
      ApiErrorCode.APPLICATION_NOT_FOUND,
      HttpStatus.NOT_FOUND,
      'Renewal application not found',
    );
  }

  private notAvailable(): DomainException {
    return new DomainException(
      ApiErrorCode.CERTIFICATE_NOT_AVAILABLE,
      HttpStatus.NOT_FOUND,
      'Technical inspection certificate is not available',
    );
  }

  private incoherent(): DomainException {
    return new DomainException(
      ApiErrorCode.CERTIFICATE_DATA_INCOHERENT,
      HttpStatus.CONFLICT,
      'Technical inspection certificate data is incoherent',
    );
  }
}

export function certificateDownloadFilename(certificateNumber: string): string {
  const safeNumber = certificateNumber
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '');
  return safeNumber === ''
    ? 'technical-inspection-certificate.pdf'
    : `technical-inspection-certificate-${safeNumber}.pdf`;
}
