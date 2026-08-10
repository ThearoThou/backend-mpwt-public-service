import 'reflect-metadata';

import { HttpStatus } from '@nestjs/common';
import type { DataSource } from 'typeorm';

import { ApiErrorCode } from '../common/errors/api-error-code';
import { CitizenProfile } from '../users/entities/citizen-profile.entity';
import { User } from '../users/entities/user.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { ApplicationDocument } from './entities/application-document.entity';
import { RenewalApplicationStatusHistory } from './entities/renewal-application-status-history.entity';
import { RenewalApplication } from './entities/renewal-application.entity';
import { ApplicationStatus } from './enums/application-status.enum';
import { DocumentStatus } from './enums/document-status.enum';
import { DocumentType } from './enums/document-type.enum';
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

describe('ApplicationWorkflowService.submit', () => {
  it('rejects an application that does not exist without writing history', async () => {
    const fixture = createSubmitFixture();
    fixture.applications.findOne.mockResolvedValue(null);

    await expect(
      fixture.service.submit(CITIZEN_ID, 'missing-id'),
    ).rejects.toMatchObject({
      code: ApiErrorCode.APPLICATION_NOT_FOUND,
      status: HttpStatus.NOT_FOUND,
    });
    expect(fixture.history.save).not.toHaveBeenCalled();
  });

  it('rejects an application owned by another citizen', async () => {
    const fixture = createSubmitFixture({ citizenId: OTHER_CITIZEN_ID });

    await expect(
      fixture.service.submit(CITIZEN_ID, 'application-id'),
    ).rejects.toMatchObject({
      code: ApiErrorCode.RESOURCE_NOT_OWNED,
      status: HttpStatus.FORBIDDEN,
    });
    expect(fixture.history.save).not.toHaveBeenCalled();
  });

  it('rejects a non-draft application', async () => {
    const fixture = createSubmitFixture({
      status: ApplicationStatus.SUBMITTED,
    });

    await expect(
      fixture.service.submit(CITIZEN_ID, 'application-id'),
    ).rejects.toMatchObject({
      code: ApiErrorCode.APPLICATION_INVALID_TRANSITION,
      status: HttpStatus.CONFLICT,
    });
    expect(fixture.history.save).not.toHaveBeenCalled();
  });

  it.each([
    DocumentType.VEHICLE_REGISTRATION_CARD,
    DocumentType.PREVIOUS_INSPECTION_CERTIFICATE,
    DocumentType.CITIZEN_ID_CARD,
  ])('rejects when %s is missing', async (missingDocumentType) => {
    const fixture = createSubmitFixture();
    fixture.documents.find.mockResolvedValue(
      requiredDocuments().filter(
        (document) => document.documentType !== missingDocumentType,
      ),
    );

    await expect(
      fixture.service.submit(CITIZEN_ID, 'application-id'),
    ).rejects.toMatchObject({
      code: ApiErrorCode.REQUIRED_DOCUMENTS_MISSING,
      status: HttpStatus.CONFLICT,
    });
    expect(fixture.history.save).not.toHaveBeenCalled();
  });

  it('rejects a rejected current required document', async () => {
    const fixture = createSubmitFixture();
    fixture.documents.find.mockResolvedValue([
      ...requiredDocuments().slice(0, 2),
      applicationDocument(
        DocumentType.CITIZEN_ID_CARD,
        DocumentStatus.REJECTED,
      ),
    ]);

    await expect(
      fixture.service.submit(CITIZEN_ID, 'application-id'),
    ).rejects.toMatchObject({
      code: ApiErrorCode.REQUIRED_DOCUMENTS_NOT_READY,
      status: HttpStatus.CONFLICT,
    });
    expect(fixture.history.save).not.toHaveBeenCalled();
  });

  it('requires a citizen profile before submission', async () => {
    const fixture = createSubmitFixture();
    fixture.profiles.findOne.mockResolvedValue(null);

    await expect(
      fixture.service.submit(CITIZEN_ID, 'application-id'),
    ).rejects.toMatchObject({
      code: ApiErrorCode.CITIZEN_PROFILE_REQUIRED,
      status: HttpStatus.CONFLICT,
    });
    expect(fixture.history.save).not.toHaveBeenCalled();
  });

  it('submits with snapshots, a permanent reference number, and one history row', async () => {
    const fixture = createSubmitFixture();

    const result = await fixture.service.submit(CITIZEN_ID, 'application-id');

    expect(fixture.dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(fixture.applications.findOne).toHaveBeenCalledWith({
      where: { id: 'application-id' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(result.status).toBe(ApplicationStatus.SUBMITTED);
    expect(result.referenceNumber).toMatch(/^VIR-\d{8}-[A-F0-9]{12}$/);
    expect(result.referenceNumber).toHaveLength(25);
    expect(fixture.application.submittedAt).toBeInstanceOf(Date);
    expect(fixture.application.applicantSnapshot).toEqual({
      userId: CITIZEN_ID,
      nameKh: 'អ្នកសាកល្បង',
      nameEn: 'Test Citizen',
      nationalIdNumber: 'ID-123456',
      phone: '012345678',
      email: 'citizen@example.test',
      address: 'Phnom Penh',
    });
    expect(fixture.application.vehicleSnapshot).toEqual({
      vehicleId: VEHICLE_ID,
      registrationNumber: 'REG-001',
      plateNumber: '2AB-1234',
      plateCategory: 'PRIVATE',
      plateProvince: 'Phnom Penh',
      plateType: 'CAR',
      vehicleType: 'SEDAN',
      vehicleClass: null,
      inspectionCategoryId: null,
      make: 'Toyota',
      model: 'Corolla',
      manufactureYear: 2020,
      chassisNumber: 'CHASSIS-001',
      firstRegistrationDate: '2020-01-01',
      lastInspectionDate: null,
      inspectionExpiryDate: '2027-01-01',
      registeredOwnerNameKh: 'ម្ចាស់យានយន្ត',
      registeredOwnerNameEn: 'Vehicle Owner',
      registeredOwnerPhone: '098765432',
    });
    expect(fixture.applications.save).toHaveBeenCalledWith(fixture.application);
    expect(fixture.history.create).toHaveBeenCalledWith({
      applicationId: 'application-id',
      previousStatus: ApplicationStatus.DRAFT,
      newStatus: ApplicationStatus.SUBMITTED,
      changedByUserId: CITIZEN_ID,
    });
    expect(fixture.history.save).toHaveBeenCalledTimes(1);
    expect(fixture.manager.getRepository).toHaveBeenCalledWith(
      RenewalApplication,
    );
    expect(fixture.manager.getRepository).toHaveBeenCalledWith(
      RenewalApplicationStatusHistory,
    );
  });

  it('retries one exact reference collision and returns only the successful result', async () => {
    const fixture = createSubmitFixture();
    const collision = referenceCollision();
    let firstReferenceNumber: string | null = null;
    fixture.applications.save.mockImplementationOnce(
      (application: Record<string, unknown>) => {
        if (typeof application.referenceNumber === 'string') {
          firstReferenceNumber = application.referenceNumber;
        }
        resetSubmitApplication(application);
        throw collision;
      },
    );

    const result = await fixture.service.submit(CITIZEN_ID, 'application-id');

    expect(fixture.dataSource.transaction).toHaveBeenCalledTimes(2);
    expect(firstReferenceNumber).toMatch(/^VIR-\d{8}-[A-F0-9]{12}$/);
    expect(result.status).toBe(ApplicationStatus.SUBMITTED);
    expect(result.referenceNumber).toMatch(/^VIR-\d{8}-[A-F0-9]{12}$/);
    expect(result.referenceNumber).not.toBe(firstReferenceNumber);
  });

  it('retries two exact reference collisions before succeeding on the third attempt', async () => {
    const fixture = createSubmitFixture();
    fixture.applications.save.mockImplementationOnce(
      (application: Record<string, unknown>) => {
        resetSubmitApplication(application);
        throw referenceCollision();
      },
    );
    fixture.applications.save.mockImplementationOnce(
      (application: Record<string, unknown>) => {
        resetSubmitApplication(application);
        throw referenceCollision();
      },
    );

    const result = await fixture.service.submit(CITIZEN_ID, 'application-id');

    expect(fixture.dataSource.transaction).toHaveBeenCalledTimes(3);
    expect(result.status).toBe(ApplicationStatus.SUBMITTED);
    expect(result.referenceNumber).toMatch(/^VIR-\d{8}-[A-F0-9]{12}$/);
  });

  it('returns a safe error after three exact reference collisions', async () => {
    const fixture = createSubmitFixture();
    fixture.applications.save.mockImplementation(
      (application: Record<string, unknown>) => {
        resetSubmitApplication(application);
        throw referenceCollision();
      },
    );

    await expect(
      fixture.service.submit(CITIZEN_ID, 'application-id'),
    ).rejects.toMatchObject({
      code: ApiErrorCode.INTERNAL_SERVER_ERROR,
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Could not generate application reference number',
    });
    expect(fixture.dataSource.transaction).toHaveBeenCalledTimes(3);
  });

  it('does not retry an unrelated PostgreSQL unique constraint error', async () => {
    const fixture = createSubmitFixture();
    const error = { code: '23505', constraint: 'another_unique_constraint' };
    fixture.dataSource.transaction.mockRejectedValue(error);

    await expect(
      fixture.service.submit(CITIZEN_ID, 'application-id'),
    ).rejects.toBe(error);
    expect(fixture.dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('does not retry a non-unique database error', async () => {
    const fixture = createSubmitFixture();
    const error = { code: '22001', constraint: 'some_constraint' };
    fixture.dataSource.transaction.mockRejectedValue(error);

    await expect(
      fixture.service.submit(CITIZEN_ID, 'application-id'),
    ).rejects.toBe(error);
    expect(fixture.dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  describe('resubmit', () => {
    it('rejects an application that does not exist', async () => {
      const fixture = createResubmitFixture();
      fixture.applications.findOne.mockResolvedValue(null);

      await expect(
        fixture.service.resubmit(CITIZEN_ID, 'missing-id'),
      ).rejects.toMatchObject({
        code: ApiErrorCode.APPLICATION_NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
      expect(fixture.history.save).not.toHaveBeenCalled();
    });

    it('rejects an application owned by another citizen', async () => {
      const fixture = createResubmitFixture({ citizenId: OTHER_CITIZEN_ID });

      await expect(
        fixture.service.resubmit(CITIZEN_ID, 'application-id'),
      ).rejects.toMatchObject({
        code: ApiErrorCode.RESOURCE_NOT_OWNED,
        status: HttpStatus.FORBIDDEN,
      });
      expect(fixture.history.save).not.toHaveBeenCalled();
    });

    it('rejects a status other than CORRECTION_REQUIRED', async () => {
      const fixture = createResubmitFixture({
        status: ApplicationStatus.SUBMITTED,
      });

      await expect(
        fixture.service.resubmit(CITIZEN_ID, 'application-id'),
      ).rejects.toMatchObject({
        code: ApiErrorCode.APPLICATION_INVALID_TRANSITION,
        status: HttpStatus.CONFLICT,
      });
      expect(fixture.history.save).not.toHaveBeenCalled();
    });

    it('rejects missing required current documents', async () => {
      const fixture = createResubmitFixture();
      fixture.documents.find.mockResolvedValue([]);

      await expect(
        fixture.service.resubmit(CITIZEN_ID, 'application-id'),
      ).rejects.toMatchObject({
        code: ApiErrorCode.REQUIRED_DOCUMENTS_MISSING,
        status: HttpStatus.CONFLICT,
      });
      expect(fixture.history.save).not.toHaveBeenCalled();
    });

    it('rejects a rejected current required document', async () => {
      const fixture = createResubmitFixture();
      fixture.documents.find.mockResolvedValue([
        ...requiredDocuments().slice(0, 2),
        applicationDocument(
          DocumentType.CITIZEN_ID_CARD,
          DocumentStatus.REJECTED,
        ),
      ]);

      await expect(
        fixture.service.resubmit(CITIZEN_ID, 'application-id'),
      ).rejects.toMatchObject({
        code: ApiErrorCode.REQUIRED_DOCUMENTS_NOT_READY,
        status: HttpStatus.CONFLICT,
      });
      expect(fixture.history.save).not.toHaveBeenCalled();
    });

    it.each([
      ['referenceNumber', null],
      ['applicantSnapshot', null],
      ['vehicleSnapshot', null],
      ['submittedAt', null],
    ])(
      'fails safely when CORRECTION_REQUIRED application has null %s',
      async (field, value) => {
        const fixture = createResubmitFixture({ [field]: value });

        await expect(
          fixture.service.resubmit(CITIZEN_ID, 'application-id'),
        ).rejects.toMatchObject({
          code: ApiErrorCode.APPLICATION_INVALID_TRANSITION,
          status: HttpStatus.CONFLICT,
        });
        expect(fixture.history.save).not.toHaveBeenCalled();
      },
    );

    it('resubmits without replacing submission data and writes one history row', async () => {
      const fixture = createResubmitFixture();
      const originalReferenceNumber = fixture.application.referenceNumber;
      const originalApplicantSnapshot = fixture.application.applicantSnapshot;
      const originalVehicleSnapshot = fixture.application.vehicleSnapshot;
      const originalSubmittedAt = fixture.application.submittedAt;
      const originalCorrectionReason =
        fixture.application.currentCorrectionReason;

      const result = await fixture.service.resubmit(
        CITIZEN_ID,
        'application-id',
      );

      expect(fixture.dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(fixture.applications.findOne).toHaveBeenCalledWith({
        where: { id: 'application-id' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(result.status).toBe(ApplicationStatus.SUBMITTED);
      expect(fixture.application.referenceNumber).toBe(originalReferenceNumber);
      expect(fixture.application.applicantSnapshot).toBe(
        originalApplicantSnapshot,
      );
      expect(fixture.application.vehicleSnapshot).toBe(originalVehicleSnapshot);
      expect(fixture.application.submittedAt).toBe(originalSubmittedAt);
      expect(fixture.application.currentCorrectionReason).toBe(
        originalCorrectionReason,
      );
      expect(fixture.applications.save).toHaveBeenCalledWith(
        fixture.application,
      );
      expect(fixture.history.create).toHaveBeenCalledWith({
        applicationId: 'application-id',
        previousStatus: ApplicationStatus.CORRECTION_REQUIRED,
        newStatus: ApplicationStatus.SUBMITTED,
        changedByUserId: CITIZEN_ID,
      });
      expect(fixture.history.save).toHaveBeenCalledTimes(1);
      expect(fixture.manager.getRepository).toHaveBeenCalledWith(
        RenewalApplication,
      );
      expect(fixture.manager.getRepository).toHaveBeenCalledWith(
        RenewalApplicationStatusHistory,
      );
    });
  });

  describe('cancel', () => {
    it.each([
      ApplicationStatus.DRAFT,
      ApplicationStatus.SUBMITTED,
      ApplicationStatus.CORRECTION_REQUIRED,
      ApplicationStatus.APPOINTMENT_SELECTION_REQUIRED,
    ])(
      'cancels a %s application in one transaction',
      async (originalStatus) => {
        const fixture = createCancelFixture(originalStatus);
        const reason = 'The citizen no longer needs this renewal.';

        const result = await fixture.service.cancel(
          CITIZEN_ID,
          'application-id',
          reason,
        );

        expect(fixture.dataSource.transaction).toHaveBeenCalledTimes(1);
        expect(fixture.applications.findOne).toHaveBeenCalledWith({
          where: { id: 'application-id' },
          lock: { mode: 'pessimistic_write' },
        });
        expect(result.status).toBe(ApplicationStatus.CANCELLED);
        expect(fixture.application.status).toBe(ApplicationStatus.CANCELLED);
        expect(fixture.application.cancelledAt).toBeInstanceOf(Date);
        expect(fixture.application.cancelledByUserId).toBe(CITIZEN_ID);
        expect(fixture.application.cancellationReason).toBe(reason);
        expect(fixture.applications.save).toHaveBeenCalledWith(
          fixture.application,
        );
        expect(fixture.history.create).toHaveBeenCalledWith({
          applicationId: 'application-id',
          previousStatus: originalStatus,
          newStatus: ApplicationStatus.CANCELLED,
          changedByUserId: CITIZEN_ID,
        });
        expect(fixture.history.save).toHaveBeenCalledTimes(1);
        expect(fixture.manager.getRepository).toHaveBeenCalledWith(
          RenewalApplication,
        );
        expect(fixture.manager.getRepository).toHaveBeenCalledWith(
          RenewalApplicationStatusHistory,
        );

        if (originalStatus === ApplicationStatus.DRAFT) {
          expect(fixture.application.referenceNumber).toBeNull();
          expect(fixture.application.applicantSnapshot).toBeNull();
          expect(fixture.application.vehicleSnapshot).toBeNull();
          expect(fixture.application.submittedAt).toBeNull();
        }
      },
    );

    it('preserves a submitted application submission data and correction reason', async () => {
      const fixture = createCancelFixture(ApplicationStatus.SUBMITTED, {
        currentCorrectionReason: 'Keep this correction context.',
      });
      const originalReferenceNumber = fixture.application.referenceNumber;
      const originalApplicantSnapshot = fixture.application.applicantSnapshot;
      const originalVehicleSnapshot = fixture.application.vehicleSnapshot;
      const originalSubmittedAt = fixture.application.submittedAt;
      const originalCorrectionReason =
        fixture.application.currentCorrectionReason;

      await fixture.service.cancel(CITIZEN_ID, 'application-id');

      expect(fixture.application.referenceNumber).toBe(originalReferenceNumber);
      expect(fixture.application.applicantSnapshot).toBe(
        originalApplicantSnapshot,
      );
      expect(fixture.application.vehicleSnapshot).toBe(originalVehicleSnapshot);
      expect(fixture.application.submittedAt).toBe(originalSubmittedAt);
      expect(fixture.application.currentCorrectionReason).toBe(
        originalCorrectionReason,
      );
    });

    it('rejects an application that does not exist', async () => {
      const fixture = createCancelFixture(ApplicationStatus.DRAFT);
      fixture.applications.findOne.mockResolvedValue(null);

      await expect(
        fixture.service.cancel(CITIZEN_ID, 'missing-id'),
      ).rejects.toMatchObject({
        code: ApiErrorCode.APPLICATION_NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
      expect(fixture.history.save).not.toHaveBeenCalled();
    });

    it('rejects an application owned by another citizen', async () => {
      const fixture = createCancelFixture(ApplicationStatus.DRAFT, {
        citizenId: OTHER_CITIZEN_ID,
      });

      await expect(
        fixture.service.cancel(CITIZEN_ID, 'application-id'),
      ).rejects.toMatchObject({
        code: ApiErrorCode.RESOURCE_NOT_OWNED,
        status: HttpStatus.FORBIDDEN,
      });
      expect(fixture.history.save).not.toHaveBeenCalled();
    });

    it.each([
      ApplicationStatus.UNDER_REVIEW,
      ApplicationStatus.APPROVED,
      ApplicationStatus.REJECTED,
      ApplicationStatus.REINSPECTION_REQUIRED,
      ApplicationStatus.CANCELLED,
      ApplicationStatus.COMPLETED,
    ])(
      'rejects cancellation from %s without writing history',
      async (status) => {
        const fixture = createCancelFixture(status);

        await expect(
          fixture.service.cancel(CITIZEN_ID, 'application-id'),
        ).rejects.toMatchObject({
          code: ApiErrorCode.APPLICATION_CANNOT_CANCEL,
          status: HttpStatus.CONFLICT,
        });
        expect(fixture.history.save).not.toHaveBeenCalled();
      },
    );
  });
});

function createSubmitFixture(
  applicationOverrides: Record<string, unknown> = {},
) {
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
    currentRejectionReason: null,
    reviewStartedAt: null,
    readyForInspectionAt: null,
    completedAt: null,
    cancelledAt: null,
    cancelledByUserId: null,
    cancellationReason: null,
    createdAt: new Date('2026-08-07T00:00:00.000Z'),
    updatedAt: new Date('2026-08-07T00:00:00.000Z'),
    ...applicationOverrides,
  };
  const applications = {
    findOne: jest.fn().mockResolvedValue(application),
    save: jest.fn().mockResolvedValue(application),
  };
  const documents = {
    find: jest.fn().mockResolvedValue(requiredDocuments()),
  };
  const users = {
    findOne: jest.fn().mockResolvedValue({
      id: CITIZEN_ID,
      phone: '012345678',
      email: 'citizen@example.test',
    }),
  };
  const profiles = {
    findOne: jest.fn().mockResolvedValue({
      userId: CITIZEN_ID,
      nameKh: 'អ្នកសាកល្បង',
      nameEn: 'Test Citizen',
      nationalIdNumber: 'ID-123456',
      address: 'Phnom Penh',
    }),
  };
  const vehicles = {
    findOne: jest.fn().mockResolvedValue(submissionVehicle()),
  };
  const history = {
    create: jest.fn((input: Record<string, unknown>) => input),
    save: jest.fn().mockResolvedValue(undefined),
  };
  const manager = {
    getRepository: jest.fn((entity) => {
      if (entity === RenewalApplication) return applications;
      if (entity === ApplicationDocument) return documents;
      if (entity === User) return users;
      if (entity === CitizenProfile) return profiles;
      if (entity === Vehicle) return vehicles;
      if (entity === RenewalApplicationStatusHistory) return history;
      throw new Error('Unexpected repository');
    }),
  };
  const dataSource = {
    transaction: jest.fn(
      (callback: (transactionManager: typeof manager) => Promise<unknown>) =>
        callback(manager),
    ),
  };

  return {
    application,
    applications,
    dataSource,
    documents,
    history,
    manager,
    profiles,
    service: new ApplicationWorkflowService(
      dataSource as unknown as DataSource,
    ),
  };
}

function createResubmitFixture(
  applicationOverrides: Record<string, unknown> = {},
) {
  const applicantSnapshot = {
    userId: CITIZEN_ID,
    nameKh: 'អ្នកសាកល្បង',
    nameEn: 'Test Citizen',
  };
  const vehicleSnapshot = {
    vehicleId: VEHICLE_ID,
    registrationNumber: 'REG-001',
    vehicleClass: null,
    inspectionCategoryId: null,
  };
  const submittedAt = new Date('2026-08-08T00:00:00.000Z');

  return createSubmitFixture({
    status: ApplicationStatus.CORRECTION_REQUIRED,
    referenceNumber: 'VIR-20260808-ABCDEF123456',
    applicantSnapshot,
    vehicleSnapshot,
    submittedAt,
    currentCorrectionReason: 'Please replace the unreadable document.',
    ...applicationOverrides,
  });
}

function createCancelFixture(
  status: ApplicationStatus,
  applicationOverrides: Record<string, unknown> = {},
) {
  if (status === ApplicationStatus.DRAFT) {
    return createSubmitFixture({ status, ...applicationOverrides });
  }

  return createSubmitFixture({
    status,
    referenceNumber: 'VIR-20260808-ABCDEF123456',
    applicantSnapshot: { userId: CITIZEN_ID, nameEn: 'Test Citizen' },
    vehicleSnapshot: { vehicleId: VEHICLE_ID, registrationNumber: 'REG-001' },
    submittedAt: new Date('2026-08-08T00:00:00.000Z'),
    currentCorrectionReason: 'A retained correction reason.',
    ...applicationOverrides,
  });
}

function requiredDocuments() {
  return [
    applicationDocument(DocumentType.VEHICLE_REGISTRATION_CARD),
    applicationDocument(DocumentType.PREVIOUS_INSPECTION_CERTIFICATE),
    applicationDocument(DocumentType.CITIZEN_ID_CARD),
  ];
}

function applicationDocument(
  documentType: DocumentType,
  status = DocumentStatus.PENDING,
) {
  return { documentType, status };
}

function referenceCollision() {
  return Object.assign(new Error('Reference number collision'), {
    code: '23505',
    constraint: 'UQ_1a269a6b188ab66ed1ebc22b0be',
  });
}

function resetSubmitApplication(application: Record<string, unknown>) {
  application.status = ApplicationStatus.DRAFT;
  application.referenceNumber = null;
  application.applicantSnapshot = null;
  application.vehicleSnapshot = null;
  application.submittedAt = null;
}

function submissionVehicle() {
  return {
    id: VEHICLE_ID,
    registrationNumber: 'REG-001',
    plateNumber: '2AB-1234',
    plateCategory: 'PRIVATE',
    plateProvince: 'Phnom Penh',
    plateType: 'CAR',
    vehicleType: 'SEDAN',
    vehicleClass: null,
    inspectionCategoryId: null,
    make: 'Toyota',
    model: 'Corolla',
    manufactureYear: 2020,
    chassisNumber: 'CHASSIS-001',
    firstRegistrationDate: '2020-01-01',
    lastInspectionDate: null,
    inspectionExpiryDate: '2027-01-01',
    registeredOwnerNameKh: 'ម្ចាស់យានយន្ត',
    registeredOwnerNameEn: 'Vehicle Owner',
    registeredOwnerPhone: '098765432',
  };
}

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
    currentRejectionReason: null,
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
