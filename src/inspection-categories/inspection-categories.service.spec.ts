import 'reflect-metadata';

import { HttpStatus } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

import { ApiErrorCode } from '../common/errors/api-error-code';
import { InspectionVehicleCategory } from './entities/inspection-vehicle-category.entity';
import { VehicleClass } from '../vehicles/enums/vehicle-class.enum';
import { InspectionCategoriesService } from './inspection-categories.service';

const CATEGORY_ID = '11111111-1111-4111-8111-111111111111';

describe('InspectionCategoriesService', () => {
  it('maps a duplicate category code to the public conflict code', async () => {
    const repository = createRepository();
    repository.existsBy.mockResolvedValue(true);
    const service = new InspectionCategoriesService(repository as never);

    await expect(service.create(createInput())).rejects.toMatchObject({
      code: ApiErrorCode.INSPECTION_CATEGORY_CODE_EXISTS,
      status: HttpStatus.CONFLICT,
    });
  });

  it('maps the exact PostgreSQL category-code unique violation', async () => {
    const repository = createRepository();
    repository.existsBy.mockResolvedValue(false);
    repository.save.mockRejectedValue({
      code: '23505',
      constraint: 'uq_inspection_vehicle_categories_code',
    });
    const service = new InspectionCategoriesService(repository as never);

    await expect(service.create(createInput())).rejects.toMatchObject({
      code: ApiErrorCode.INSPECTION_CATEGORY_CODE_EXISTS,
      status: HttpStatus.CONFLICT,
    });
  });

  it('keeps category code and vehicle class unchanged during update', async () => {
    const repository = createRepository();
    const category = makeCategory();
    repository.findOne.mockResolvedValue(category);
    repository.save.mockResolvedValue(category);
    const service = new InspectionCategoriesService(repository as never);

    await service.update(CATEGORY_ID, {
      nameKh: 'ឡានតូចថ្មី',
      isActive: false,
    });

    expect(category).toMatchObject({
      code: 'LIGHT-PRIVATE',
      vehicleClass: VehicleClass.LIGHT,
      nameKh: 'ឡានតូចថ្មី',
      isActive: false,
    });
  });

  it('rejects an empty category update with VALIDATION_ERROR', async () => {
    const repository = createRepository();
    repository.findOne.mockResolvedValue(makeCategory());
    const service = new InspectionCategoriesService(repository as never);

    await expect(service.update(CATEGORY_ID, {})).rejects.toMatchObject({
      code: ApiErrorCode.VALIDATION_ERROR,
      status: HttpStatus.BAD_REQUEST,
    });
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('distinguishes an inactive category through the classification manager lookup', async () => {
    const category = makeCategory({ isActive: false });
    const { manager, repository, transaction } =
      createClassificationManager(category);
    const service = new InspectionCategoriesService(
      createRepository() as never,
    );

    await expect(
      service.findActiveByIdForClassificationWithManager(manager, CATEGORY_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.INSPECTION_CATEGORY_INACTIVE,
      status: HttpStatus.CONFLICT,
    });
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: CATEGORY_ID },
      lock: { mode: 'pessimistic_read' },
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('reports a missing category through the classification manager lookup', async () => {
    const { manager, repository } = createClassificationManager(null);
    const service = new InspectionCategoriesService(
      createRepository() as never,
    );

    await expect(
      service.findActiveByIdForClassificationWithManager(manager, CATEGORY_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.INSPECTION_CATEGORY_NOT_FOUND,
      status: HttpStatus.NOT_FOUND,
    });
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: CATEGORY_ID },
      lock: { mode: 'pessimistic_read' },
    });
  });

  it('reports a missing category', async () => {
    const repository = createRepository();
    repository.findOne.mockResolvedValue(null);
    const service = new InspectionCategoriesService(repository as never);

    await expect(service.getById(CATEGORY_ID)).rejects.toMatchObject({
      code: ApiErrorCode.INSPECTION_CATEGORY_NOT_FOUND,
      status: HttpStatus.NOT_FOUND,
    });
  });
});

function createRepository() {
  return {
    existsBy: jest.fn(),
    create: jest.fn((value) => value as InspectionVehicleCategory),
    save: jest.fn(),
    findOne: jest.fn(),
  };
}

function createInput() {
  return {
    code: 'LIGHT-PRIVATE',
    nameKh: 'ឡានតូច',
    nameEn: null,
    vehicleClass: VehicleClass.LIGHT,
    validityMonths: 12,
    inspectionFeeKhr: '25000.00',
    serviceFeeKhr: '5000.00',
  };
}

function makeCategory(
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

function createClassificationManager(
  category: InspectionVehicleCategory | null,
): {
  manager: EntityManager;
  repository: { findOne: jest.Mock };
  transaction: jest.Mock;
} {
  const repository = {
    findOne: jest.fn().mockResolvedValue(category),
  };
  const transaction = jest.fn();
  const manager = {
    getRepository: jest.fn().mockReturnValue(repository),
    transaction,
  } as unknown as EntityManager;

  return { manager, repository, transaction };
}
