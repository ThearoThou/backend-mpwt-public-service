import 'reflect-metadata';

import { HttpStatus } from '@nestjs/common';
import type { DataSource } from 'typeorm';

import { ApiErrorCode } from '../common/errors/api-error-code';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { RenewalApplicationStatusHistory } from './entities/renewal-application-status-history.entity';
import { RenewalApplication } from './entities/renewal-application.entity';
import { ApplicationStatus } from './enums/application-status.enum';
import { ApplicationWorkflowService } from './application-workflow.service';

const CITIZEN_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CITIZEN_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';

describe('ApplicationWorkflowService', () => {
  it('creates a draft and its initial history row in one transaction', async () => {
    const fixture = createFixture();
    const service = new ApplicationWorkflowService(
      fixture.dataSource as unknown as DataSource,
    );

    const result = await service.createDraft(CITIZEN_ID, VEHICLE_ID);

    expect(fixture.dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(fixture.manager.getRepository).toHaveBeenCalledWith(Vehicle);
    expect(fixture.manager.getRepository).toHaveBeenCalledWith(
      RenewalApplication,
    );
    expect(fixture.manager.getRepository).toHaveBeenCalledWith(
      RenewalApplicationStatusHistory,
    );
    expect(fixture.applications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        citizenId: CITIZEN_ID,
        vehicleId: VEHICLE_ID,
        status: ApplicationStatus.DRAFT,
        referenceNumber: null,
        applicantSnapshot: null,
        vehicleSnapshot: null,
        submittedAt: null,
      }),
    );
    expect(fixture.history.create).toHaveBeenCalledWith({
      applicationId: 'application-id',
      previousStatus: null,
      newStatus: ApplicationStatus.DRAFT,
      changedByUserId: CITIZEN_ID,
    });
    expect(result).toMatchObject({
      status: ApplicationStatus.DRAFT,
      referenceNumber: null,
      submittedAt: null,
    });
  });

  it('rejects a missing vehicle', async () => {
    const fixture = createFixture();
    fixture.vehicles.findOne.mockResolvedValue(null);

    await expect(
      new ApplicationWorkflowService(
        fixture.dataSource as unknown as DataSource,
      ).createDraft(CITIZEN_ID, VEHICLE_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.VEHICLE_NOT_FOUND,
      status: HttpStatus.NOT_FOUND,
    });
  });

  it('rejects a vehicle owned by another citizen', async () => {
    const fixture = createFixture();
    fixture.vehicles.findOne.mockResolvedValue(vehicle(OTHER_CITIZEN_ID));

    await expect(
      new ApplicationWorkflowService(
        fixture.dataSource as unknown as DataSource,
      ).createDraft(CITIZEN_ID, VEHICLE_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.RESOURCE_NOT_OWNED,
      status: HttpStatus.FORBIDDEN,
    });
  });

  it('rejects when an unfinished application already exists', async () => {
    const fixture = createFixture();
    fixture.applications.existsBy.mockResolvedValue(true);

    await expect(
      new ApplicationWorkflowService(
        fixture.dataSource as unknown as DataSource,
      ).createDraft(CITIZEN_ID, VEHICLE_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.UNFINISHED_APPLICATION_ALREADY_EXISTS,
      status: HttpStatus.CONFLICT,
    });
  });

  it('maps only the unfinished-application unique conflict', async () => {
    const fixture = createFixture();
    fixture.dataSource.transaction.mockRejectedValue({
      code: '23505',
      constraint: 'uq_unfinished_application_per_vehicle',
    });
    const service = new ApplicationWorkflowService(
      fixture.dataSource as unknown as DataSource,
    );

    await expect(
      service.createDraft(CITIZEN_ID, VEHICLE_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.UNFINISHED_APPLICATION_ALREADY_EXISTS,
    });

    const unrelatedUniqueError = {
      code: '23505',
      constraint: 'another_constraint',
    };
    fixture.dataSource.transaction.mockRejectedValue(unrelatedUniqueError);
    await expect(service.createDraft(CITIZEN_ID, VEHICLE_ID)).rejects.toBe(
      unrelatedUniqueError,
    );
  });

  it('propagates a history-insertion failure so the transaction rolls back', async () => {
    const fixture = createFixture();
    const error = new Error('history insert failed');
    fixture.history.save.mockRejectedValue(error);

    await expect(
      new ApplicationWorkflowService(
        fixture.dataSource as unknown as DataSource,
      ).createDraft(CITIZEN_ID, VEHICLE_ID),
    ).rejects.toBe(error);
    expect(fixture.dataSource.transaction).toHaveBeenCalledTimes(1);
  });
});

function createFixture() {
  const vehicles = {
    findOne: jest.fn().mockResolvedValue(vehicle(CITIZEN_ID)),
  };
  const application = {
    id: 'application-id',
    citizenId: CITIZEN_ID,
    vehicleId: VEHICLE_ID,
    status: ApplicationStatus.DRAFT,
    referenceNumber: null,
    applicantSnapshot: null,
    vehicleSnapshot: null,
    submittedAt: null,
    currentCorrectionReason: null,
    reviewStartedAt: null,
    readyForInspectionAt: null,
    completedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    createdAt: new Date('2026-08-07T00:00:00.000Z'),
    updatedAt: new Date('2026-08-07T00:00:00.000Z'),
  };
  const applications = {
    existsBy: jest.fn().mockResolvedValue(false),
    create: jest.fn((input: Record<string, unknown>) => ({
      ...application,
      ...input,
    })),
    save: jest.fn().mockResolvedValue(application),
  };
  const history = {
    create: jest.fn((input: Record<string, unknown>) => input),
    save: jest.fn().mockResolvedValue(undefined),
  };
  const manager = {
    getRepository: jest.fn((entity) => {
      if (entity === Vehicle) return vehicles;
      if (entity === RenewalApplication) return applications;
      return history;
    }),
  };
  const dataSource = {
    transaction: jest.fn(
      (callback: (transactionManager: typeof manager) => Promise<unknown>) =>
        callback(manager),
    ),
  };

  return { dataSource, manager, vehicles, applications, history };
}

function vehicle(linkedCitizenId: string) {
  return { id: VEHICLE_ID, linkedCitizenId };
}
