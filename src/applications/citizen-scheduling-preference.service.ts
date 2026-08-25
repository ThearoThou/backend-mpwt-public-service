import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { CitizenSchedulingAvailabilityService } from '../scheduling/citizen-scheduling-availability.service';
import { CitizenPreferredSchedulingService } from '../scheduling/citizen-preferred-scheduling.service';
import { InspectionStationDailyCapacity } from '../scheduling/entities/inspection-station-daily-capacity.entity';
import { InspectionStationDailyCapacityService } from '../scheduling/inspection-station-daily-capacity.service';
import { Appointment } from '../scheduling/entities/appointment.entity';
import { AppointmentStatus } from '../scheduling/enums/appointment-status.enum';
import { PaymentsService } from '../payments/payments.service';
import { RenewalApplicationStatusHistory } from './entities/renewal-application-status-history.entity';
import { RenewalApplication } from './entities/renewal-application.entity';
import { ApplicationStatus } from './enums/application-status.enum';

export interface CitizenInspectionPreferenceInput {
  stationId: string;
  capacityDate: string;
}

@Injectable()
export class CitizenSchedulingPreferenceService {
  private readonly logger = new Logger(CitizenSchedulingPreferenceService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly availability: CitizenSchedulingAvailabilityService,
    private readonly preferredScheduling: CitizenPreferredSchedulingService,
    private readonly dailyCapacities: InspectionStationDailyCapacityService,
    private readonly payments: PaymentsService,
  ) {}

  async updateDraftPreference(
    citizenId: string,
    applicationId: string,
    input: CitizenInspectionPreferenceInput,
  ): Promise<RenewalApplication> {
    return this.dataSource.transaction(async (manager) => {
      const application = await this.locked(manager, citizenId, applicationId);
      this.requireStatus(application, ApplicationStatus.DRAFT);
      await this.preferredScheduling.validatePreferredDateWithManager(
        manager,
        input.stationId,
        input.capacityDate,
      );

      application.preferredInspectionStationId = input.stationId;
      application.preferredInspectionDate = input.capacityDate;
      return manager.getRepository(RenewalApplication).save(application);
    });
  }

  async validateAppointmentSelectionRequired(
    citizenId: string,
    applicationId: string,
    input: CitizenInspectionPreferenceInput,
  ): Promise<void> {
    await this.dataSource.transaction((manager) =>
      this.validateAppointmentSelectionRequiredWithManager(
        manager,
        citizenId,
        applicationId,
        input,
      ),
    );
  }

  async reserveAppointmentSelection(
    citizenId: string,
    applicationId: string,
    input: CitizenInspectionPreferenceInput,
  ): Promise<RenewalApplication> {
    const result = await this.dataSource.transaction(async (manager) => {
      const application = await this.locked(manager, citizenId, applicationId);
      this.requireStatus(
        application,
        ApplicationStatus.APPOINTMENT_SELECTION_REQUIRED,
      );
      const reservedCapacity =
        await this.dailyCapacities.reserveDailyCapacityWithManager(
          manager,
          input.stationId,
          input.capacityDate,
        );
      if (reservedCapacity === null) {
        throw new DomainException(
          ApiErrorCode.CONFLICT,
          HttpStatus.CONFLICT,
          'Inspection station date is not currently selectable',
        );
      }

      const dailyCapacity = await manager
        .getRepository(InspectionStationDailyCapacity)
        .findOneByOrFail({ id: reservedCapacity.id });
      const appointments = manager.getRepository(Appointment);
      await appointments.save(
        appointments.create({
          applicationId: application.id,
          slotId: null,
          dailyCapacity,
          status: AppointmentStatus.SCHEDULED,
          completedAt: null,
          cancelledAt: null,
          cancelledByUserId: null,
          cancellationReason: null,
          noShowMarkedAt: null,
          noShowMarkedByUserId: null,
        }),
      );
      application.preferredInspectionStationId = input.stationId;
      application.preferredInspectionDate = input.capacityDate;
      application.status = ApplicationStatus.APPROVED;
      await manager.getRepository(RenewalApplication).save(application);
      const history = manager.getRepository(RenewalApplicationStatusHistory);
      await history.save(
        history.create({
          applicationId: application.id,
          previousStatus: ApplicationStatus.APPOINTMENT_SELECTION_REQUIRED,
          newStatus: ApplicationStatus.APPROVED,
          changedByUserId: citizenId,
        }),
      );
      return application;
    });
    await this.initializePaymentAfterScheduling(applicationId);
    return result;
  }

  async validateAppointmentSelectionRequiredWithManager(
    manager: EntityManager,
    citizenId: string,
    applicationId: string,
    input: CitizenInspectionPreferenceInput,
  ): Promise<InspectionStationDailyCapacity> {
    const application = await this.locked(manager, citizenId, applicationId);
    this.requireStatus(
      application,
      ApplicationStatus.APPOINTMENT_SELECTION_REQUIRED,
    );
    return this.availability.validateSelectableWithManager(
      manager,
      input.stationId,
      input.capacityDate,
    );
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

  private async initializePaymentAfterScheduling(
    applicationId: string,
  ): Promise<void> {
    try {
      await this.payments.initializePayment(applicationId);
    } catch (error) {
      this.logger.error(
        `Automatic payment initialization failed after appointment-selection scheduling: ${applicationId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
