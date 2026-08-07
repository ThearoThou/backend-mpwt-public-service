import 'reflect-metadata';

import { HttpStatus } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';

import { InspectionCategoriesService } from '../inspection-categories/inspection-categories.service';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { InspectionVehicleCategory } from '../inspection-categories/entities/inspection-vehicle-category.entity';
import { VehicleClassificationHistory } from './entities/vehicle-classification-history.entity';
import { Vehicle } from './entities/vehicle.entity';
import { VehicleClass } from './enums/vehicle-class.enum';
import { VehicleClassificationService } from './vehicle-classification.service';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const VEHICLE_ID = '22222222-2222-4222-8222-222222222222';
const CATEGORY_ID = '33333333-3333-4333-8333-333333333333';
const PREVIOUS_CATEGORY_ID = '44444444-4444-4444-8444-444444444444';

describe('VehicleClassificationService', () => {
  it('writes a first classification and immutable history in one transaction', async () => {
    const harness = createHarness(vehicle());

    const response = await harness.service.classify(ADMIN_ID, VEHICLE_ID, {
      inspectionCategoryId: CATEGORY_ID,
      reason: ' Initial classification ',
    });

    expect(harness.transaction).toHaveBeenCalledTimes(1);
    expect(harness.vehicleRepository.findOne).toHaveBeenCalledWith({
      where: { id: VEHICLE_ID },
      lock: { mode: 'pessimistic_write' },
    });
    expect(harness.categoryLookup).toHaveBeenCalledWith(
      harness.manager,
      CATEGORY_ID,
    );
    const savedVehicle = harness.vehicleRepository.save.mock.calls[0]?.[0];
    expect(savedVehicle).toMatchObject({
      vehicleClass: VehicleClass.LIGHT,
      inspectionCategoryId: CATEGORY_ID,
      classificationVerifiedBy: ADMIN_ID,
    });
    expect(savedVehicle?.classificationVerifiedAt).toBeInstanceOf(Date);
    expect(harness.historyRepository.create).toHaveBeenCalledWith({
      vehicleId: VEHICLE_ID,
      previousVehicleClass: null,
      previousInspectionCategoryId: null,
      newVehicleClass: VehicleClass.LIGHT,
      newInspectionCategoryId: CATEGORY_ID,
      changedByAdminId: ADMIN_ID,
      reason: 'Initial classification',
    });
    expect(harness.historyRepository.save).toHaveBeenCalledTimes(1);
    expect(response).toMatchObject({
      vehicleClass: VehicleClass.LIGHT,
      inspectionCategoryId: CATEGORY_ID,
    });
  });

  it('copies prior classification values when correcting a vehicle', async () => {
    const harness = createHarness(
      vehicle({
        vehicleClass: VehicleClass.LIGHT,
        inspectionCategoryId: PREVIOUS_CATEGORY_ID,
      }),
      category({ vehicleClass: VehicleClass.HEAVY }),
    );

    await harness.service.classify(ADMIN_ID, VEHICLE_ID, {
      inspectionCategoryId: CATEGORY_ID,
      reason: 'Corrected classification',
    });

    expect(harness.historyRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        previousVehicleClass: VehicleClass.LIGHT,
        previousInspectionCategoryId: PREVIOUS_CATEGORY_ID,
        newVehicleClass: VehicleClass.HEAVY,
        newInspectionCategoryId: CATEGORY_ID,
      }),
    );
  });

  it('rejects a missing vehicle before looking up a category', async () => {
    const harness = createHarness(null);

    await expect(
      harness.service.classify(ADMIN_ID, VEHICLE_ID, {
        inspectionCategoryId: CATEGORY_ID,
        reason: 'Valid reason',
      }),
    ).rejects.toMatchObject({
      code: ApiErrorCode.VEHICLE_NOT_FOUND,
      status: HttpStatus.NOT_FOUND,
    });
    expect(harness.categoryLookup).not.toHaveBeenCalled();
  });

  it('propagates category not-found and inactive errors without saving', async () => {
    for (const code of [
      ApiErrorCode.INSPECTION_CATEGORY_NOT_FOUND,
      ApiErrorCode.INSPECTION_CATEGORY_INACTIVE,
    ]) {
      const harness = createHarness(vehicle());
      harness.categoryLookup.mockRejectedValue({ code });

      await expect(
        harness.service.classify(ADMIN_ID, VEHICLE_ID, {
          inspectionCategoryId: CATEGORY_ID,
          reason: 'Valid reason',
        }),
      ).rejects.toMatchObject({ code });
      expect(harness.vehicleRepository.save).not.toHaveBeenCalled();
      expect(harness.historyRepository.save).not.toHaveBeenCalled();
    }
  });

  it('rejects a no-op classification without history', async () => {
    const harness = createHarness(
      vehicle({ inspectionCategoryId: CATEGORY_ID }),
    );

    await expect(
      harness.service.classify(ADMIN_ID, VEHICLE_ID, {
        inspectionCategoryId: CATEGORY_ID,
        reason: 'No change',
      }),
    ).rejects.toMatchObject({
      code: ApiErrorCode.VEHICLE_CLASSIFICATION_UNCHANGED,
      status: HttpStatus.CONFLICT,
    });
    expect(harness.vehicleRepository.save).not.toHaveBeenCalled();
    expect(harness.historyRepository.save).not.toHaveBeenCalled();
  });

  it('propagates history persistence failure for transaction rollback', async () => {
    const harness = createHarness(vehicle());
    const error = new Error('history insert failed');
    harness.historyRepository.save.mockRejectedValue(error);

    await expect(
      harness.service.classify(ADMIN_ID, VEHICLE_ID, {
        inspectionCategoryId: CATEGORY_ID,
        reason: 'Valid reason',
      }),
    ).rejects.toBe(error);
  });

  it('returns empty, deterministically ordered history for an existing vehicle', async () => {
    const harness = createHarness(vehicle());
    harness.readVehicles.existsBy.mockResolvedValue(true);
    const query = createHistoryQuery([]);
    harness.histories.createQueryBuilder.mockReturnValue(query);

    const result = await harness.service.listHistory(VEHICLE_ID, {
      page: 1,
      limit: 20,
      sortOrder: 'desc',
    });

    expect(result.data).toEqual([]);
    expect(query.orderBy).toHaveBeenCalledWith('history.createdAt', 'DESC');
    expect(query.addOrderBy).toHaveBeenCalledWith('history.id', 'DESC');
    expect(query.skip).toHaveBeenCalledWith(0);
    expect(query.take).toHaveBeenCalledWith(20);
  });

  it('rejects history listing for a missing vehicle', async () => {
    const harness = createHarness(vehicle());
    harness.readVehicles.existsBy.mockResolvedValue(false);

    await expect(
      harness.service.listHistory(VEHICLE_ID, {
        page: 1,
        limit: 20,
        sortOrder: 'desc',
      }),
    ).rejects.toMatchObject({ code: ApiErrorCode.VEHICLE_NOT_FOUND });
  });
});

function createHarness(
  lockedVehicle: Vehicle | null,
  activeCategory = category(),
) {
  const vehicleRepository = {
    findOne: jest.fn().mockResolvedValue(lockedVehicle),
    save: jest.fn((value: Vehicle) => Promise.resolve(value)),
  };
  const historyRepository = {
    create: jest.fn(
      (value: Partial<VehicleClassificationHistory>) =>
        value as VehicleClassificationHistory,
    ),
    save: jest.fn((value: VehicleClassificationHistory) =>
      Promise.resolve({
        id: '55555555-5555-4555-8555-555555555555',
        ...value,
      }),
    ),
  };
  const manager = {
    getRepository: jest.fn((entity) =>
      entity === Vehicle ? vehicleRepository : historyRepository,
    ),
  } as unknown as EntityManager;
  const transaction = jest.fn(
    (callback: (activeManager: EntityManager) => Promise<unknown>) =>
      callback(manager),
  );
  const dataSource = { transaction } as unknown as DataSource;
  const readVehicles = { existsBy: jest.fn() };
  const histories = { createQueryBuilder: jest.fn() };
  const categoryLookup = jest
    .fn<Promise<InspectionVehicleCategory>, [EntityManager, string]>()
    .mockResolvedValue(activeCategory);
  const categoryService = {
    findActiveByIdForClassificationWithManager: categoryLookup,
  } as unknown as jest.Mocked<
    Pick<
      InspectionCategoriesService,
      'findActiveByIdForClassificationWithManager'
    >
  >;
  const service = new VehicleClassificationService(
    dataSource,
    readVehicles as never,
    histories as never,
    categoryService as InspectionCategoriesService,
  );

  return {
    service,
    transaction,
    manager,
    vehicleRepository,
    historyRepository,
    readVehicles,
    histories,
    categoryService,
    categoryLookup,
  };
}

function createHistoryQuery(histories: VehicleClassificationHistory[]) {
  return {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([histories, histories.length]),
  };
}

function category(
  overrides: Partial<InspectionVehicleCategory> = {},
): InspectionVehicleCategory {
  return {
    id: CATEGORY_ID,
    code: 'LIGHT-PRIVATE',
    nameKh: 'ឡានតូច',
    nameEn: null,
    vehicleClass: VehicleClass.LIGHT,
    validityMonths: 12,
    inspectionFeeKhr: '25000.00',
    serviceFeeKhr: '5000.00',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function vehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: VEHICLE_ID,
    linkedCitizenId: null,
    registrationNumber: 'REG-1',
    plateNumber: '1AB-1234',
    plateCategory: 'PROVINCE' as Vehicle['plateCategory'],
    plateProvince: 'Phnom Penh',
    plateType: 'Private',
    vehicleType: 'Passenger Car',
    vehicleClass: null,
    inspectionCategoryId: null,
    classificationVerifiedAt: null,
    classificationVerifiedBy: null,
    make: 'Example',
    model: 'Car',
    manufactureYear: null,
    chassisNumber: 'CHASSIS-1',
    firstRegistrationDate: '2020-01-01',
    lastInspectionDate: null,
    inspectionExpiryDate: '2026-01-01',
    registeredOwnerNameKh: 'ម្ចាស់',
    registeredOwnerNameEn: 'Owner',
    registeredOwnerPhone: '+85512345678',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    linkedCitizen: null,
    renewalApplications: [],
    ...overrides,
  };
}
