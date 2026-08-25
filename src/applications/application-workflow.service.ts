import { HttpStatus, Injectable } from '@nestjs/common';
import { DataSource, In, type EntityManager } from 'typeorm';
import { randomBytes } from 'node:crypto';
import { User } from '../users/entities/user.entity';
import { CitizenProfile } from '../users/entities/citizen-profile.entity';
import { ApplicationDocument } from './entities/application-document.entity';
import { DocumentType } from './enums/document-type.enum';
import { DocumentStatus } from './enums/document-status.enum';

import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import {
  mapRenewalApplication,
  type RenewalApplicationResponse,
} from './application-response.mapper';
import { RenewalApplicationStatusHistory } from './entities/renewal-application-status-history.entity';
import { RenewalApplication } from './entities/renewal-application.entity';
import { ApplicationStatus } from './enums/application-status.enum';
import { CitizenPreferredSchedulingService } from '../scheduling/citizen-preferred-scheduling.service';

const UNFINISHED_APPLICATION_STATUSES = [
  ApplicationStatus.DRAFT,
  ApplicationStatus.SUBMITTED,
  ApplicationStatus.UNDER_REVIEW,
  ApplicationStatus.CORRECTION_REQUIRED,
  ApplicationStatus.APPOINTMENT_SELECTION_REQUIRED,
  ApplicationStatus.APPROVED,
  ApplicationStatus.REINSPECTION_REQUIRED,
] as const;

const UNFINISHED_APPLICATION_UNIQUE_INDEX =
  'uq_unfinished_application_per_vehicle';

@Injectable()
export class ApplicationWorkflowService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly preferredScheduling: CitizenPreferredSchedulingService,
  ) {}

  async createDraft(
    citizenId: string,
    vehicleId: string,
  ): Promise<RenewalApplicationResponse> {
    try {
      return await this.dataSource.transaction((manager) =>
        this.createDraftWithManager(manager, citizenId, vehicleId),
      );
    } catch (error) {
      if (this.isUnfinishedApplicationUniqueConflict(error)) {
        throw this.unfinishedApplicationExists();
      }

      throw error;
    }
  }
  async submit(
    citizenId: string,
    applicationId: string,
  ): Promise<RenewalApplicationResponse> {
    for (let attempt = 0; attempt < 3; attempt++)
      try {
        return await this.dataSource.transaction((m) =>
          this.submitWithManager(m, citizenId, applicationId),
        );
      } catch (e) {
        if (this.referenceConflict(e)) {
          if (attempt < 2) continue;
          throw new DomainException(
            ApiErrorCode.INTERNAL_SERVER_ERROR,
            HttpStatus.INTERNAL_SERVER_ERROR,
            'Could not generate application reference number',
          );
        }
        throw e;
      }
    throw new DomainException(
      ApiErrorCode.INTERNAL_SERVER_ERROR,
      HttpStatus.INTERNAL_SERVER_ERROR,
      'Could not generate application reference number',
    );
  }
  async resubmit(citizenId: string, applicationId: string) {
    return this.dataSource.transaction((m) =>
      this.transition(
        m,
        citizenId,
        applicationId,
        ApplicationStatus.CORRECTION_REQUIRED,
        ApplicationStatus.SUBMITTED,
      ),
    );
  }
  async cancel(
    citizenId: string,
    applicationId: string,
    reason?: string | null,
  ) {
    return this.dataSource.transaction(async (m) => {
      const a = await this.locked(m, citizenId, applicationId);
      if (
        ![
          ApplicationStatus.DRAFT,
          ApplicationStatus.SUBMITTED,
          ApplicationStatus.CORRECTION_REQUIRED,
          ApplicationStatus.APPOINTMENT_SELECTION_REQUIRED,
        ].includes(a.status)
      )
        throw new DomainException(
          ApiErrorCode.APPLICATION_CANNOT_CANCEL,
          HttpStatus.CONFLICT,
          'Application cannot be cancelled',
        );
      const p = a.status,
        now = new Date();
      a.status = ApplicationStatus.CANCELLED;
      a.cancelledAt = now;
      a.cancelledByUserId = citizenId;
      a.cancellationReason = reason ?? null;
      await m.getRepository(RenewalApplication).save(a);
      await this.history(m, a.id, p, ApplicationStatus.CANCELLED, citizenId);
      return mapRenewalApplication(a);
    });
  }
  private async submitWithManager(m: EntityManager, c: string, id: string) {
    const a = await this.locked(m, c, id);
    if (a.status !== ApplicationStatus.DRAFT)
      throw new DomainException(
        ApiErrorCode.APPLICATION_INVALID_TRANSITION,
        HttpStatus.CONFLICT,
        'Application cannot be submitted',
      );
    await this.docs(m, id);
    const u = await m.getRepository(User).findOne({ where: { id: c } });
    const p = await m
      .getRepository(CitizenProfile)
      .findOne({ where: { userId: c } });
    if (u === null || p === null)
      throw new DomainException(
        ApiErrorCode.CITIZEN_PROFILE_REQUIRED,
        HttpStatus.CONFLICT,
        'Citizen profile is required before application submission',
      );
    const v = await m
      .getRepository(Vehicle)
      .findOne({ where: { id: a.vehicleId } });
    if (v === null)
      throw new DomainException(
        ApiErrorCode.VEHICLE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        'Vehicle not found',
      );
    if (
      a.preferredInspectionStationId === null ||
      a.preferredInspectionDate === null
    )
      throw new DomainException(
        ApiErrorCode.CONFLICT,
        HttpStatus.CONFLICT,
        'A preferred inspection station and date are required before application submission',
      );
    await this.preferredScheduling.validatePreferredDateWithManager(
      m,
      a.preferredInspectionStationId,
      a.preferredInspectionDate,
    );
    const now = new Date();
    a.referenceNumber = this.ref(now);
    a.applicantSnapshot = {
      userId: u.id,
      nameKh: p.nameKh,
      nameEn: p.nameEn,
      nationalIdNumber: p.nationalIdNumber,
      phone: u.phone,
      email: u.email,
      address: p.address,
    };
    a.vehicleSnapshot = {
      vehicleId: v.id,
      registrationNumber: v.registrationNumber,
      plateNumber: v.plateNumber,
      plateCategory: v.plateCategory,
      plateProvince: v.plateProvince,
      plateType: v.plateType,
      vehicleType: v.vehicleType,
      vehicleClass: v.vehicleClass,
      inspectionCategoryId: v.inspectionCategoryId,
      make: v.make,
      model: v.model,
      manufactureYear: v.manufactureYear,
      chassisNumber: v.chassisNumber,
      firstRegistrationDate: v.firstRegistrationDate,
      lastInspectionDate: v.lastInspectionDate,
      inspectionExpiryDate: v.inspectionExpiryDate,
      registeredOwnerNameKh: v.registeredOwnerNameKh,
      registeredOwnerNameEn: v.registeredOwnerNameEn,
      registeredOwnerPhone: v.registeredOwnerPhone,
    };
    a.submittedAt = now;
    a.status = ApplicationStatus.SUBMITTED;
    await m.getRepository(RenewalApplication).save(a);
    await this.history(
      m,
      a.id,
      ApplicationStatus.DRAFT,
      ApplicationStatus.SUBMITTED,
      c,
    );
    return mapRenewalApplication(a);
  }
  private async transition(
    m: EntityManager,
    c: string,
    id: string,
    from: ApplicationStatus,
    to: ApplicationStatus,
  ) {
    const a = await this.locked(m, c, id);
    if (a.status !== from)
      throw new DomainException(
        ApiErrorCode.APPLICATION_INVALID_TRANSITION,
        HttpStatus.CONFLICT,
        'Application transition is invalid',
      );
    await this.docs(m, id);
    if (
      a.referenceNumber === null ||
      a.applicantSnapshot === null ||
      a.vehicleSnapshot === null ||
      a.submittedAt === null
    )
      throw new DomainException(
        ApiErrorCode.APPLICATION_INVALID_TRANSITION,
        HttpStatus.CONFLICT,
        'Application submission data is incomplete',
      );
    a.status = to;
    await m.getRepository(RenewalApplication).save(a);
    await this.history(m, a.id, from, to, c);
    return mapRenewalApplication(a);
  }
  private async locked(m: EntityManager, c: string, id: string) {
    const a = await m
      .getRepository(RenewalApplication)
      .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
    if (a === null)
      throw new DomainException(
        ApiErrorCode.APPLICATION_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        'Renewal application not found',
      );
    if (a.citizenId !== c)
      throw new DomainException(
        ApiErrorCode.RESOURCE_NOT_OWNED,
        HttpStatus.FORBIDDEN,
        'Renewal application is outside the citizen ownership scope',
      );
    return a;
  }
  private async docs(m: EntityManager, id: string) {
    const rows = await m
      .getRepository(ApplicationDocument)
      .find({ where: { applicationId: id, isCurrent: true } });
    const types = Object.values(DocumentType);
    if (types.some((t) => !rows.some((r) => r.documentType === t)))
      throw new DomainException(
        ApiErrorCode.REQUIRED_DOCUMENTS_MISSING,
        HttpStatus.CONFLICT,
        'Required documents are missing',
      );
    if (
      rows.some(
        (r) =>
          types.includes(r.documentType) &&
          r.status === DocumentStatus.REJECTED,
      )
    )
      throw new DomainException(
        ApiErrorCode.REQUIRED_DOCUMENTS_NOT_READY,
        HttpStatus.CONFLICT,
        'Rejected required documents must be replaced before submission',
      );
  }
  private async history(
    m: EntityManager,
    id: string,
    p: ApplicationStatus,
    n: ApplicationStatus,
    c: string,
  ) {
    const r = m.getRepository(RenewalApplicationStatusHistory);
    await r.save(
      r.create({
        applicationId: id,
        previousStatus: p,
        newStatus: n,
        changedByUserId: c,
      }),
    );
  }
  private ref(now: Date) {
    const d = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Phnom_Penh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .format(now)
      .replaceAll('-', '');
    return `VIR-${d}-${randomBytes(6).toString('hex').toUpperCase()}`;
  }
  private referenceConflict(e: unknown) {
    const x =
      (
        e as {
          driverError?: { code?: string; constraint?: string };
          code?: string;
          constraint?: string;
        }
      ).driverError ?? (e as { code?: string; constraint?: string });
    return (
      x.code === '23505' && x.constraint === 'UQ_1a269a6b188ab66ed1ebc22b0be'
    );
  }

  private async createDraftWithManager(
    manager: EntityManager,
    citizenId: string,
    vehicleId: string,
  ): Promise<RenewalApplicationResponse> {
    const vehicles = manager.getRepository(Vehicle);
    const vehicle = await vehicles.findOne({ where: { id: vehicleId } });

    if (vehicle === null) {
      throw new DomainException(
        ApiErrorCode.VEHICLE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        'Vehicle not found',
      );
    }

    if (vehicle.linkedCitizenId !== citizenId) {
      throw new DomainException(
        ApiErrorCode.RESOURCE_NOT_OWNED,
        HttpStatus.FORBIDDEN,
        'Vehicle is outside the citizen ownership scope',
      );
    }

    if (!this.hasCompleteVehicleClassification(vehicle)) {
      throw new DomainException(
        ApiErrorCode.VEHICLE_CLASSIFICATION_INCOMPLETE,
        HttpStatus.CONFLICT,
        'Vehicle inspection classification is incomplete',
      );
    }

    const applications = manager.getRepository(RenewalApplication);
    if (
      await applications.existsBy({
        vehicleId,
        status: In(UNFINISHED_APPLICATION_STATUSES),
      })
    ) {
      throw this.unfinishedApplicationExists();
    }

    const application = await applications.save(
      applications.create({
        citizenId,
        vehicleId,
        status: ApplicationStatus.DRAFT,
        referenceNumber: null,
        applicantSnapshot: null,
        vehicleSnapshot: null,
        submittedAt: null,
      }),
    );

    const history = manager.getRepository(RenewalApplicationStatusHistory);
    await history.save(
      history.create({
        applicationId: application.id,
        previousStatus: null,
        newStatus: ApplicationStatus.DRAFT,
        changedByUserId: citizenId,
      }),
    );

    return mapRenewalApplication(application);
  }

  private isUnfinishedApplicationUniqueConflict(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
      return false;
    }

    const candidate = error as {
      code?: unknown;
      constraint?: unknown;
      driverError?: { code?: unknown; constraint?: unknown };
    };
    const databaseError = candidate.driverError ?? candidate;

    return (
      databaseError.code === '23505' &&
      databaseError.constraint === UNFINISHED_APPLICATION_UNIQUE_INDEX
    );
  }

  private unfinishedApplicationExists(): DomainException {
    return new DomainException(
      ApiErrorCode.UNFINISHED_APPLICATION_ALREADY_EXISTS,
      HttpStatus.CONFLICT,
      'An unfinished renewal application already exists for this vehicle',
    );
  }

  private hasCompleteVehicleClassification(vehicle: Vehicle): boolean {
    return (
      vehicle.vehicleClass !== null &&
      vehicle.inspectionCategoryId !== null &&
      vehicle.classificationVerifiedAt !== null &&
      vehicle.classificationVerifiedBy !== null
    );
  }
}
