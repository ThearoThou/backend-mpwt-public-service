import 'reflect-metadata';

import { HttpStatus } from '@nestjs/common';
import type { Repository } from 'typeorm';

import { ApiErrorCode } from '../common/errors/api-error-code';
import { CreateVehicleRequestDto } from './dto/vehicle-request.dtos';
import { Vehicle } from './entities/vehicle.entity';
import { VehiclePlateCategory } from './enums/vehicle-plate-category.enum';
import { mapVehicle } from './vehicle-response.mapper';
import { VehiclesService } from './vehicles.service';

const CITIZEN_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CITIZEN_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const REGISTRATION_UNIQUE_CONSTRAINT = 'UQ_2abf18fae2b9477bc1927675311';
const CHASSIS_UNIQUE_CONSTRAINT = 'UQ_90d5b70f93e2d5e4517020c2dff';
const PROVINCE_PLATE_UNIQUE_INDEX = 'uq_vehicles_province_plate_identity';
const PERSONALIZED_PLATE_UNIQUE_INDEX = 'uq_vehicles_personalized_plate_number';

describe('VehiclesService', () => {
  it('creates a normalized vehicle linked to the authenticated citizen', async () => {
    const repository = createRepository();
    const service = createService(repository);

    const response = await service.createCitizenVehicle(
      CITIZEN_ID,
      createInput({
        registrationNumber: ' ab-1234 ',
        chassisNumber: ' ch  123 ',
        plateNumber: ' 2ab-3146 ',
        registeredOwnerPhone: '012 345 678',
      }),
    );

    expect(repository.existsBy).toHaveBeenNthCalledWith(1, {
      registrationNumber: 'AB-1234',
    });
    expect(repository.existsBy).toHaveBeenNthCalledWith(2, {
      chassisNumber: 'CH 123',
    });
    expect(repository.existsBy).toHaveBeenNthCalledWith(3, {
      plateCategory: VehiclePlateCategory.PROVINCE,
      plateProvince: 'ភ្នំពេញ',
      plateNumber: '2AB-3146',
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        linkedCitizenId: CITIZEN_ID,
        registrationNumber: 'AB-1234',
        chassisNumber: 'CH 123',
        plateNumber: '2AB-3146',
        registeredOwnerPhone: '+85512345678',
      }),
    );
    expect(response).toMatchObject({
      id: VEHICLE_ID,
      linkedCitizenId: CITIZEN_ID,
    });
  });

  it('uses the approved registration, chassis, then plate conflict precedence', async () => {
    const repository = createRepository();
    repository.existsBy.mockResolvedValueOnce(true);
    const service = createService(repository);

    await expect(
      service.createCitizenVehicle(CITIZEN_ID, createInput()),
    ).rejects.toMatchObject({
      code: ApiErrorCode.VEHICLE_REGISTRATION_CONFLICT,
    });
    expect(repository.existsBy).toHaveBeenCalledTimes(1);

    repository.existsBy
      .mockReset()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    await expect(
      service.createCitizenVehicle(CITIZEN_ID, createInput()),
    ).rejects.toMatchObject({ code: ApiErrorCode.VEHICLE_CHASSIS_CONFLICT });

    repository.existsBy
      .mockReset()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    await expect(
      service.createCitizenVehicle(CITIZEN_ID, createInput()),
    ).rejects.toMatchObject({ code: ApiErrorCode.VEHICLE_PLATE_CONFLICT });
  });

  it.each([
    ['the same plate type', 'Private'],
    ['a different plate type', 'Commercial'],
  ])(
    'rejects the same province and plate number with %s',
    async (_scenario, plateType) => {
      const repository = createRepository();
      repository.existsBy
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);
      const service = createService(repository);

      await expect(
        service.createCitizenVehicle(CITIZEN_ID, createInput({ plateType })),
      ).rejects.toMatchObject({
        code: ApiErrorCode.VEHICLE_PLATE_CONFLICT,
        status: HttpStatus.CONFLICT,
      });

      expect(repository.existsBy).toHaveBeenNthCalledWith(3, {
        plateCategory: VehiclePlateCategory.PROVINCE,
        plateProvince: 'ភ្នំពេញ',
        plateNumber: '2AB-3146',
      });
    },
  );

  it('allows the same province-format plate number in a different province', async () => {
    const repository = createRepository();
    const service = createService(repository);

    await expect(
      service.createCitizenVehicle(
        CITIZEN_ID,
        createInput({ plateProvince: 'សៀមរាប' }),
      ),
    ).resolves.toMatchObject({ id: VEHICLE_ID });

    expect(repository.existsBy).toHaveBeenNthCalledWith(3, {
      plateCategory: VehiclePlateCategory.PROVINCE,
      plateProvince: 'សៀមរាប',
      plateNumber: '2AB-3146',
    });
  });

  it.each([
    [
      REGISTRATION_UNIQUE_CONSTRAINT,
      ApiErrorCode.VEHICLE_REGISTRATION_CONFLICT,
    ],
    [CHASSIS_UNIQUE_CONSTRAINT, ApiErrorCode.VEHICLE_CHASSIS_CONFLICT],
    [PROVINCE_PLATE_UNIQUE_INDEX, ApiErrorCode.VEHICLE_PLATE_CONFLICT],
    [PERSONALIZED_PLATE_UNIQUE_INDEX, ApiErrorCode.VEHICLE_PLATE_CONFLICT],
  ])(
    'maps a %s unique-insert race to the approved code',
    async (constraint, code) => {
      const repository = createRepository();
      repository.save.mockRejectedValue({
        code: '23505',
        constraint,
        detail: 'must not be exposed',
      });
      const service = createService(repository);

      await expect(
        service.createCitizenVehicle(CITIZEN_ID, createInput()),
      ).rejects.toMatchObject({ code, status: HttpStatus.CONFLICT });
    },
  );

  it('rethrows database errors that are not known vehicle unique constraints', async () => {
    const repository = createRepository();
    const error = new Error('connection lost');
    repository.save.mockRejectedValue(error);
    const service = createService(repository);

    await expect(
      service.createCitizenVehicle(CITIZEN_ID, createInput()),
    ).rejects.toBe(error);
  });

  it('enforces citizen ownership while distinguishing absent permitted vehicles', async () => {
    const repository = createRepository();
    const service = createService(repository);

    repository.findOne.mockResolvedValueOnce(
      vehicle({ linkedCitizenId: OTHER_CITIZEN_ID }),
    );
    await expect(
      service.getCitizenVehicle(CITIZEN_ID, VEHICLE_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.RESOURCE_NOT_OWNED,
      status: HttpStatus.FORBIDDEN,
    });

    repository.findOne.mockResolvedValueOnce(null);
    await expect(
      service.getCitizenVehicle(CITIZEN_ID, VEHICLE_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.VEHICLE_NOT_FOUND,
      status: HttpStatus.NOT_FOUND,
    });
  });

  it('scopes citizen lists and applies allowlisted pagination and sorting', async () => {
    const repository = createRepository();
    const query = createListQuery();
    repository.createQueryBuilder.mockReturnValue(query);
    const service = createService(repository);

    const result = await service.listCitizenVehicles(CITIZEN_ID, {
      page: 2,
      limit: 10,
      sortOrder: 'asc',
      sortBy: 'registrationNumber',
    });

    expect(query.andWhere).toHaveBeenCalledWith(
      'vehicle.linkedCitizenId = :citizenId',
      { citizenId: CITIZEN_ID },
    );
    expect(query.orderBy).toHaveBeenCalledWith(
      'vehicle.registrationNumber',
      'ASC',
    );
    expect(query.skip).toHaveBeenCalledWith(10);
    expect(query.take).toHaveBeenCalledWith(10);
    expect(result.meta).toEqual({
      page: 2,
      limit: 10,
      total: 1,
      totalPages: 1,
    });
  });

  it('applies normalized admin filters without loading citizen relations', async () => {
    const repository = createRepository();
    const query = createListQuery();
    repository.createQueryBuilder.mockReturnValue(query);
    const service = createService(repository);

    await service.listAdminVehicles({
      page: 1,
      limit: 20,
      sortOrder: 'desc',
      sortBy: 'plateNumber',
      linkedCitizenId: CITIZEN_ID,
      registrationNumber: ' ab-1234 ',
      chassisNumber: ' ch  123 ',
      plateNumber: ' 2ab-3146 ',
      createdFrom: '2030-01-01',
      createdTo: '2030-12-31',
    });

    expect(query.andWhere).toHaveBeenCalledWith(
      'vehicle.registrationNumber = :registrationNumber',
      { registrationNumber: 'AB-1234' },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      'vehicle.chassisNumber = :chassisNumber',
      { chassisNumber: 'CH 123' },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      'vehicle.plateNumber = :plateNumber',
      { plateNumber: '2AB-3146' },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      'vehicle.createdAt >= :createdFrom',
      { createdFrom: new Date('2030-01-01T00:00:00.000Z') },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      'vehicle.createdAt < :createdToExclusive',
      { createdToExclusive: new Date('2031-01-01T00:00:00.000Z') },
    );
    expect(query.orderBy).toHaveBeenCalledWith('vehicle.plateNumber', 'DESC');
  });

  it('maps only approved response fields and excludes entity relations', () => {
    const mapped = mapVehicle({
      ...vehicle(),
      linkedCitizen: { id: CITIZEN_ID },
      renewalApplications: [{ id: 'application-id' }],
    } as unknown as Vehicle);

    expect(mapped).toMatchObject({
      id: VEHICLE_ID,
      linkedCitizenId: CITIZEN_ID,
    });
    expect(mapped).not.toHaveProperty('linkedCitizen');
    expect(mapped).not.toHaveProperty('renewalApplications');
  });
});

function createService(repository: ReturnType<typeof createRepository>) {
  return new VehiclesService(repository as unknown as Repository<Vehicle>);
}

function createRepository() {
  const saved = vehicle();

  return {
    existsBy: jest.fn().mockResolvedValue(false),
    create: jest.fn((input: Partial<Vehicle>) => ({ ...saved, ...input })),
    save: jest.fn().mockResolvedValue(saved),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
}

function createListQuery() {
  return {
    select: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[vehicle()], 1]),
  };
}

function createInput(
  overrides: Partial<CreateVehicleRequestDto> = {},
): CreateVehicleRequestDto {
  return {
    registrationNumber: 'AB-1234',
    plateNumber: '2AB-3146',
    plateCategory: VehiclePlateCategory.PROVINCE,
    plateProvince: 'ភ្នំពេញ',
    plateType: 'Private',
    vehicleType: 'Car',
    make: 'Toyota',
    model: 'Camry',
    chassisNumber: 'CH-123',
    firstRegistrationDate: '2020-01-01',
    inspectionExpiryDate: '2030-01-01',
    registeredOwnerNameKh: 'អ្នកបើកបរ',
    registeredOwnerNameEn: 'Citizen Owner',
    registeredOwnerPhone: '+85512345678',
    ...overrides,
  };
}

function vehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: VEHICLE_ID,
    linkedCitizenId: CITIZEN_ID,
    registrationNumber: 'AB-1234',
    plateNumber: '2AB-3146',
    plateCategory: VehiclePlateCategory.PROVINCE,
    plateProvince: 'ភ្នំពេញ',
    plateType: 'Private',
    vehicleType: 'Car',
    make: 'Toyota',
    model: 'Camry',
    manufactureYear: 2020,
    chassisNumber: 'CH-123',
    firstRegistrationDate: '2020-01-01',
    lastInspectionDate: null,
    inspectionExpiryDate: '2030-01-01',
    registeredOwnerNameKh: 'អ្នកបើកបរ',
    registeredOwnerNameEn: 'Citizen Owner',
    registeredOwnerPhone: '+85512345678',
    isActive: true,
    createdAt: new Date('2030-01-01T00:00:00.000Z'),
    updatedAt: new Date('2030-01-01T00:00:00.000Z'),
    linkedCitizen: null,
    renewalApplications: [],
    ...overrides,
  };
}
