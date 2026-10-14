import { HttpStatus, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { CitizenPreferredSchedulingService } from '../scheduling/citizen-preferred-scheduling.service';
import { RenewalApplication } from './entities/renewal-application.entity';
import { ApplicationStatus } from './enums/application-status.enum';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { InspectionVehicleCategory } from '../inspection-categories/entities/inspection-vehicle-category.entity';
import { isOptionalOversizeServiceEligible } from '../payments/optional-oversize-service';

export interface CitizenInspectionPreferenceInput {
  preferredInspectionStationId?: string | null;
  preferredInspectionDate: string;
  optionalOversizeServiceSelected?: boolean;
}

@Injectable()
export class CitizenSchedulingPreferenceService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly preferredScheduling: CitizenPreferredSchedulingService,
  ) {}

  async updateDraftPreference(
    citizenId: string,
    applicationId: string,
    input: CitizenInspectionPreferenceInput,
  ): Promise<RenewalApplication> {
    return this.dataSource.transaction(async (manager) => {
      const application = await this.locked(manager, citizenId, applicationId);
      this.requireStatus(application, ApplicationStatus.DRAFT);
      await this.preferredScheduling.validatePreferredDate(
        input.preferredInspectionDate,
      );
      const stationId = input.preferredInspectionStationId ?? null;
      await this.preferredScheduling.validateOptionalStationWithManager(
        manager,
        stationId,
      );

      let optionalServiceEligible = false;
      if (input.optionalOversizeServiceSelected !== undefined) {
        const vehicle = await manager.getRepository(Vehicle).findOne({
          where: { id: application.vehicleId },
        });
        const category = vehicle?.inspectionCategoryId
          ? await manager.getRepository(InspectionVehicleCategory).findOne({
              where: { id: vehicle.inspectionCategoryId },
            })
          : null;
        optionalServiceEligible =
          vehicle !== null &&
          vehicle !== undefined &&
          category !== null &&
          isOptionalOversizeServiceEligible(vehicle, category.code);
      }
      if (
        input.optionalOversizeServiceSelected === true &&
        !optionalServiceEligible
      ) {
        throw new DomainException(
          ApiErrorCode.CONFLICT,
          HttpStatus.CONFLICT,
          'The optional oversize marking service is not available for this vehicle',
        );
      }

      application.preferredInspectionStationId = stationId;
      application.preferredInspectionDate = input.preferredInspectionDate;
      application.optionalOversizeServiceSelected =
        optionalServiceEligible &&
        (input.optionalOversizeServiceSelected ?? false);
      return manager.getRepository(RenewalApplication).save(application);
    });
  }

  private async locked(
    manager: EntityManager,
    citizenId: string,
    applicationId: string,
  ): Promise<RenewalApplication> {
    const application = await manager
      .getRepository(RenewalApplication)
      .findOne({
        where: { id: applicationId },
        lock: { mode: 'pessimistic_write' },
      });

    if (application === null) {
      throw new DomainException(
        ApiErrorCode.APPLICATION_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        'Renewal application not found',
      );
    }

    if (application.citizenId !== citizenId) {
      throw new DomainException(
        ApiErrorCode.RESOURCE_NOT_OWNED,
        HttpStatus.FORBIDDEN,
        'Renewal application is outside the citizen ownership scope',
      );
    }

    return application;
  }

  private requireStatus(
    application: RenewalApplication,
    expectedStatus: ApplicationStatus,
  ): void {
    if (application.status !== expectedStatus) {
      throw new DomainException(
        ApiErrorCode.APPLICATION_INVALID_TRANSITION,
        HttpStatus.CONFLICT,
        'Application scheduling selection is not allowed in its current status',
      );
    }
  }
}
