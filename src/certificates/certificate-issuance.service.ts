import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { DataSource, QueryFailedError, type EntityManager } from 'typeorm';

import { ApplicationTimelineEvent } from '../activity/entities/application-timeline-event.entity';
import { TimelineEventType } from '../activity/enums/timeline-event-type.enum';
import { RenewalApplicationStatusHistory } from '../applications/entities/renewal-application-status-history.entity';
import { RenewalApplication } from '../applications/entities/renewal-application.entity';
import { ApplicationStatus } from '../applications/enums/application-status.enum';
import { expireInitialApplicationIfDue } from '../applications/initial-application-expiry';
import { isTechnicalCertificateIssuanceReady } from '../applications/technical-certificate-readiness';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { FilesService } from '../files/files.service';
import { Inspection } from '../inspections/entities/inspection.entity';
import { InspectionResult } from '../inspections/enums/inspection-result.enum';
import { InspectionStatus } from '../inspections/enums/inspection-status.enum';
import { Payment } from '../payments/entities/payment.entity';
import { Sticker } from '../stickers/entities/sticker.entity';
import {
  CertificatePdfService,
  type CertificatePdfInput,
} from './certificate-pdf.service';
import {
  mapTechnicalInspectionCertificateResponse,
  type TechnicalInspectionCertificateResponse,
} from './certificate-response.mapper';
import type { CertificateNumberDto } from './dto/certificate-number.dto';
import { TechnicalInspectionCertificate } from './entities/technical-inspection-certificate.entity';

const APPLICATION_EXPIRED = Symbol('APPLICATION_EXPIRED');
export const TECHNICAL_CERTIFICATE_ISSUED_REASON =
  'TECHNICAL_CERTIFICATE_ISSUED';

@Injectable()
export class CertificateIssuanceService {
  private readonly logger = new Logger(CertificateIssuanceService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly pdf: CertificatePdfService,
    private readonly files: FilesService,
  ) {}

  async issue(
    applicationId: string,
    adminUserId: string,
    input: CertificateNumberDto,
  ): Promise<TechnicalInspectionCertificateResponse> {
    const certificateNumber = input.certificateNumber.trim();
    const artifact = { fileKey: null as string | null };

    try {
      const result = await this.dataSource.transaction(async (manager) => {
        const application = await this.lockApplication(manager, applicationId);
        const certificates = manager.getRepository(
          TechnicalInspectionCertificate,
        );
        const inspections = manager.getRepository(Inspection);
        const existingForApplication = await certificates.findOne({
          where: { applicationId },
        });
        if (existingForApplication !== null) throw this.alreadyExists();
        if (
          application.status !== ApplicationStatus.APPROVED ||
          application.submittedAt === null
        ) {
          throw this.notReady();
        }

        const issuedAt = await this.currentTimestamp(manager);
        if (
          await expireInitialApplicationIfDue(manager, application, issuedAt)
        ) {
          return APPLICATION_EXPIRED;
        }

        const payment = await manager.getRepository(Payment).findOne({
          where: { applicationId },
        });
        const primaryInspection = await inspections.findOne({
          where: {
            applicationId,
            attemptNumber: 1,
            status: InspectionStatus.COMPLETED,
            result: InspectionResult.PASS,
          },
          order: { completedAt: 'DESC', id: 'DESC' },
        });
        const sticker = await manager.getRepository(Sticker).findOne({
          where: { applicationId },
        });
        const documentsApprovedEvent = await manager
          .getRepository(ApplicationTimelineEvent)
          .findOne({
            where: {
              applicationId,
              eventType: TimelineEventType.DOCUMENTS_APPROVED,
            },
            order: { occurredAt: 'DESC', id: 'DESC' },
          });

        if (primaryInspection !== null) {
          const existingForInspection = await certificates.findOne({
            where: { inspectionId: primaryInspection.id },
          });
          if (existingForInspection !== null) throw this.alreadyExists();
        }
        const existingNumber = await certificates.findOne({
          where: { certificateNumber },
        });
        if (existingNumber !== null) throw this.numberConflict();

        if (
          !isTechnicalCertificateIssuanceReady(
            {
              application,
              payment,
              primaryInspection,
              sticker,
              documentsApprovedEvent,
              existingCertificate: null,
            },
            issuedAt,
          )
        ) {
          throw this.notReady();
        }
        const inspection = primaryInspection as Inspection;
        const pdfInput = this.pdfInput(
          application,
          inspection,
          certificateNumber,
          issuedAt,
        );
        const pdfBuffer = await this.pdf.generate(pdfInput);
        const stored = await this.files.saveCertificateArtifact(
          applicationId,
          pdfBuffer,
        );
        artifact.fileKey = stored.storageKey;

        const certificate = certificates.create({
          applicationId,
          inspectionId: inspection.id,
          certificateNumber,
          issuedAt,
          issuedByUserId: adminUserId,
          artifactFileKey: artifact.fileKey,
        });
        await certificates.save(certificate);

        application.status = ApplicationStatus.COMPLETED;
        application.completedAt = issuedAt;
        await manager.getRepository(RenewalApplication).save(application);

        const history = manager.getRepository(RenewalApplicationStatusHistory);
        await history.save(
          history.create({
            applicationId,
            previousStatus: ApplicationStatus.APPROVED,
            newStatus: ApplicationStatus.COMPLETED,
            changedByUserId: adminUserId,
            reason: TECHNICAL_CERTIFICATE_ISSUED_REASON,
            createdAt: issuedAt,
          }),
        );

        const events = manager.getRepository(ApplicationTimelineEvent);
        await events.save(
          events.create({
            applicationId,
            eventType: TimelineEventType.APPLICATION_COMPLETED,
            title: 'Application completed',
            message: null,
            actorUserId: adminUserId,
            visibleToCitizen: true,
            metadata: null,
            occurredAt: issuedAt,
            createdAt: issuedAt,
          }),
        );

        return mapTechnicalInspectionCertificateResponse(
          certificate,
          inspection,
        );
      });

      if (result === APPLICATION_EXPIRED) throw this.notReady();
      return result;
    } catch (error) {
      if (artifact.fileKey !== null) {
        const cleanupKey = artifact.fileKey;
        try {
          await this.files.deleteIfExists(cleanupKey);
        } catch (cleanupError) {
          this.logger.error(
            `Failed to clean up certificate artifact ${cleanupKey}`,
            cleanupError instanceof Error
              ? cleanupError.stack
              : String(cleanupError),
          );
        }
      }
      this.mapError(error);
    }
  }

  private async lockApplication(
    manager: EntityManager,
    applicationId: string,
  ): Promise<RenewalApplication> {
    const application = await manager
      .getRepository(RenewalApplication)
      .createQueryBuilder('application')
      .setLock('pessimistic_write')
      .where('application.id = :applicationId', { applicationId })
      .getOne();
    if (application === null) {
      throw new DomainException(
        ApiErrorCode.APPLICATION_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        'Renewal application not found',
      );
    }
    return application;
  }

  private async currentTimestamp(manager: EntityManager): Promise<Date> {
    const [clock] = await manager.query<Array<{ now: Date }>>(
      'SELECT now() AS "now"',
    );
    if (clock === undefined) {
      throw new Error('Certificate issuance timestamp unavailable');
    }
    return clock.now;
  }

  private pdfInput(
    application: RenewalApplication,
    inspection: Inspection,
    certificateNumber: string,
    issuedAt: Date,
  ): CertificatePdfInput {
    const snapshot = application.vehicleSnapshot;
    return {
      certificate: { certificateNumber, issuedAt },
      inspection: {
        completedAt: inspection.completedAt as Date,
        validUntil: inspection.validUntil as string,
      },
      vehicle: {
        make: snapshotText(snapshot, 'make') ?? '',
        model: snapshotText(snapshot, 'model') ?? '',
        manufactureYear: snapshotNumber(snapshot, 'manufactureYear'),
        vehicleType: snapshotText(snapshot, 'vehicleType') ?? '',
        colour: snapshotText(snapshot, 'colour'),
        engineNumber: snapshotText(snapshot, 'engineNumber'),
        chassisNumber: snapshotText(snapshot, 'chassisNumber') ?? '',
        numberOfCylinders: snapshotNumber(snapshot, 'numberOfCylinders'),
        engineDisplacementCc: snapshotNumber(snapshot, 'engineDisplacementCc'),
        enginePowerHp: snapshotText(snapshot, 'enginePowerHp'),
        fuelType: snapshotText(snapshot, 'fuelType'),
        numberOfSeats: snapshotNumber(snapshot, 'numberOfSeats'),
        numberOfAxles: snapshotNumber(snapshot, 'numberOfAxles'),
        steering: snapshotText(snapshot, 'steering'),
        vehicleWeightKg: snapshotNumber(snapshot, 'vehicleWeightKg'),
        maximumLoadKg: snapshotNumber(snapshot, 'maximumLoadKg'),
        maximumGrossWeightKg: snapshotNumber(snapshot, 'maximumGrossWeightKg'),
        wheelSize: snapshotText(snapshot, 'wheelSize'),
        lengthMm: snapshotNumber(snapshot, 'lengthMm'),
        widthMm: snapshotNumber(snapshot, 'widthMm'),
        heightMm: snapshotNumber(snapshot, 'heightMm'),
      },
      note: null,
    };
  }

  private mapError(error: unknown): never {
    if (error instanceof DomainException) throw error;
    if (error instanceof QueryFailedError) {
      const driver = error.driverError as {
        code?: string;
        constraint?: string;
      };
      if (
        driver.code === '23505' &&
        driver.constraint === 'uq_technical_inspection_certificates_number'
      ) {
        throw this.numberConflict();
      }
      if (
        driver.code === '23505' &&
        [
          'uq_technical_inspection_certificates_application',
          'uq_technical_inspection_certificates_inspection',
        ].includes(driver.constraint ?? '')
      ) {
        throw this.alreadyExists();
      }
    }
    if (
      error instanceof Error &&
      error.message.startsWith('Certificate PDF field')
    ) {
      throw this.notReady(error.message);
    }
    if (error instanceof Error) throw error;
    throw new DomainException(
      ApiErrorCode.INTERNAL_SERVER_ERROR,
      HttpStatus.INTERNAL_SERVER_ERROR,
      'Certificate issuance failed',
    );
  }

  private notReady(
    message = 'Application is not ready for certificate issuance',
  ) {
    return new DomainException(
      ApiErrorCode.CERTIFICATE_NOT_READY,
      HttpStatus.CONFLICT,
      message,
    );
  }

  private alreadyExists() {
    return new DomainException(
      ApiErrorCode.CERTIFICATE_ALREADY_EXISTS,
      HttpStatus.CONFLICT,
      'A technical inspection certificate already exists',
    );
  }

  private numberConflict() {
    return new DomainException(
      ApiErrorCode.CERTIFICATE_NUMBER_CONFLICT,
      HttpStatus.CONFLICT,
      'Certificate number is already in use',
    );
  }
}

function snapshotText(
  snapshot: RenewalApplication['vehicleSnapshot'],
  key: string,
): string | null {
  const value = snapshot?.[key];
  return typeof value === 'string' ? value : null;
}

function snapshotNumber(
  snapshot: RenewalApplication['vehicleSnapshot'],
  key: string,
): number | null {
  const value = snapshot?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
