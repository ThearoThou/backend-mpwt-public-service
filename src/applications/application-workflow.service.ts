import { HttpStatus, Injectable } from '@nestjs/common';
import { DataSource, In, type EntityManager } from 'typeorm';

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
  constructor(private readonly dataSource: DataSource) {}

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
}
