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

  it("prevents a citizen from retrieving another citizen's vehicle", async () => {
    const repository = createRepository();
    const query = createListQuery();
    repository.createQueryBuilder.mockReturnValue(query);
    const service = createService(repository);

    query.getOne.mockResolvedValueOnce(
      vehicle({ linkedCitizenId: OTHER_CITIZEN_ID }),
    );
    await expect(
      service.getCitizenVehicle(CITIZEN_ID, VEHICLE_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.RESOURCE_NOT_OWNED,
      status: HttpStatus.FORBIDDEN,
    });

    query.getOne.mockResolvedValueOnce(null);
    await expect(
      service.getCitizenVehicle(CITIZEN_ID, VEHICLE_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.VEHICLE_NOT_FOUND,
      status: HttpStatus.NOT_FOUND,
    });
  });

  it('preserves unfiltered citizen lists with pagination and sorting', async () => {
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
    expect(query.select).toHaveBeenCalledWith(
      expect.not.arrayContaining(['vehicle.engineNumber']),
    );
    expect(query.addSelect).not.toHaveBeenCalled();
    expect(result.meta).toEqual({
      page: 2,
      limit: 10,
      total: 1,
      totalPages: 1,
    });
  });

  it('orders citizen vehicles by inspection expiry with an updatedAt tie-break', async () => {
    const repository = createRepository();
    const query = createListQuery();
    repository.createQueryBuilder.mockReturnValue(query);
    const service = createService(repository);

    await service.listCitizenVehicles(CITIZEN_ID, {
      page: 1,
      limit: 20,
      sortOrder: 'asc',
      sortBy: 'inspectionExpiryDate',
    });

    expect(query.orderBy).toHaveBeenNthCalledWith(
      1,
      'vehicle.inspectionExpiryDate',
      'ASC',
    );
    expect(query.addOrderBy).toHaveBeenCalledWith('vehicle.updatedAt', 'DESC');
  });

  it('orders citizen vehicles directly by updatedAt without an expiry tie-break', async () => {
    const repository = createRepository();
    const query = createListQuery();
    repository.createQueryBuilder.mockReturnValue(query);
    const service = createService(repository);

    await service.listCitizenVehicles(CITIZEN_ID, {
      page: 1,
      limit: 20,
      sortOrder: 'desc',
      sortBy: 'updatedAt',
    });

    expect(query.orderBy).toHaveBeenCalledWith('vehicle.updatedAt', 'DESC');
    expect(query.addOrderBy).not.toHaveBeenCalled();
  });

  it('does not apply the updatedAt tie-break to admin vehicle lists', async () => {
    const repository = createRepository();
    const query = createListQuery();
    repository.createQueryBuilder.mockReturnValue(query);
    const service = createService(repository);

    await service.listAdminVehicles({
      page: 1,
      limit: 20,
      sortOrder: 'asc',
      sortBy: 'inspectionExpiryDate',
    });

    expect(query.orderBy).toHaveBeenCalledTimes(1);
    expect(query.addOrderBy).not.toHaveBeenCalled();
    expect(query.orderBy).toHaveBeenCalledWith(
      'vehicle.inspectionExpiryDate',
      'ASC',
    );
  });

  it('applies ordering before pagination limit and offset', async () => {
    const repository = createRepository();
    const query = createListQuery();
    repository.createQueryBuilder.mockReturnValue(query);
    const service = createService(repository);

    await service.listCitizenVehicles(CITIZEN_ID, {
      page: 2,
      limit: 10,
      sortOrder: 'asc',
      sortBy: 'inspectionExpiryDate',
    });

    expect(query.orderBy.mock.invocationCallOrder[0]).toBeLessThan(
      query.addOrderBy.mock.invocationCallOrder[0],
    );
    expect(query.addOrderBy.mock.invocationCallOrder[0]).toBeLessThan(
      query.skip.mock.invocationCallOrder[0],
    );
    expect(query.skip.mock.invocationCallOrder[0]).toBeLessThan(
      query.take.mock.invocationCallOrder[0],
    );
    expect(query.skip).toHaveBeenCalledWith(10);
    expect(query.take).toHaveBeenCalledWith(10);
  });

  it('looks up a citizen vehicle by normalized registration number', async () => {
    const repository = createRepository();
    const query = createListQuery();
    repository.createQueryBuilder.mockReturnValue(query);
    const service = createService(repository);

    await service.listCitizenVehicles(CITIZEN_ID, {
      page: 1,
      limit: 20,
      sortOrder: 'desc',
      sortBy: 'createdAt',
      registrationNumber: ' ab-1234 ',
    });

    expect(query.andWhere).toHaveBeenCalledWith(
      'vehicle.linkedCitizenId = :citizenId',
      { citizenId: CITIZEN_ID },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      'vehicle.registrationNumber = :registrationNumber',
      { registrationNumber: 'AB-1234' },
    );
  });

  it.each([
    ['2021', { searchText0: '%2021%', searchYear0: '2021' }],
    ['Toyota', { searchText0: '%Toyota%', searchYear0: 'Toyota' }],
    ['3AH-8724', { searchText0: '%3AH-8724%', searchYear0: '3AH-8724' }],
    [
      'REG-KD-2021-8724',
      { searchText0: '%REG-KD-2021-8724%', searchYear0: 'REG-KD-2021-8724' },
    ],
  ])(
    'searches citizen vehicles by %s before pagination',
    async (search, parameters) => {
      const repository = createRepository();
      const query = createListQuery();
      repository.createQueryBuilder.mockReturnValue(query);
      const service = createService(repository);

      await service.listCitizenVehicles(CITIZEN_ID, {
        page: 1,
        limit: 20,
        sortOrder: 'desc',
        sortBy: 'createdAt',
        search,
      });

      expect(query.andWhere).toHaveBeenCalledWith(
        '(vehicle.plateNumber ILIKE :searchText0 OR vehicle.registrationNumber ILIKE :searchText0 OR vehicle.make ILIKE :searchText0 OR vehicle.model ILIKE :searchText0 OR CAST(vehicle.manufactureYear AS TEXT) = :searchYear0)',
        parameters,
      );
      expect(query.skip).toHaveBeenCalledWith(0);
      expect(query.take).toHaveBeenCalledWith(20);
    },
  );

  it.each([
    ['Toyota 2021', '%Toyota%', 'Toyota', '%2021%', '2021'],
    ['Hilux 2021', '%Hilux%', 'Hilux', '%2021%', '2021'],
  ])(
    'requires every token in a citizen vehicle search: %s',
    async (search, firstText, firstYear, secondText, secondYear) => {
      const repository = createRepository();
      const query = createListQuery();
      repository.createQueryBuilder.mockReturnValue(query);
      const service = createService(repository);

      await service.listCitizenVehicles(CITIZEN_ID, {
        page: 1,
        limit: 20,
        sortOrder: 'desc',
        sortBy: 'createdAt',
        search,
      });

      expect(query.andWhere).toHaveBeenNthCalledWith(
        1,
        'vehicle.linkedCitizenId = :citizenId',
        { citizenId: CITIZEN_ID },
      );
      expect(query.andWhere).toHaveBeenNthCalledWith(
        2,
        '(vehicle.plateNumber ILIKE :searchText0 OR vehicle.registrationNumber ILIKE :searchText0 OR vehicle.make ILIKE :searchText0 OR vehicle.model ILIKE :searchText0 OR CAST(vehicle.manufactureYear AS TEXT) = :searchYear0)',
        { searchText0: firstText, searchYear0: firstYear },
      );
      expect(query.andWhere).toHaveBeenNthCalledWith(
        3,
        '(vehicle.plateNumber ILIKE :searchText1 OR vehicle.registrationNumber ILIKE :searchText1 OR vehicle.make ILIKE :searchText1 OR vehicle.model ILIKE :searchText1 OR CAST(vehicle.manufactureYear AS TEXT) = :searchYear1)',
        { searchText1: secondText, searchYear1: secondYear },
      );
    },
  );

  it('returns empty searched pagination while retaining the authenticated citizen scope', async () => {
    const repository = createRepository();
    const query = createListQuery([], 0);
    repository.createQueryBuilder.mockReturnValue(query);
    const service = createService(repository);

    const result = await service.listCitizenVehicles(CITIZEN_ID, {
      page: 1,
      limit: 20,
      sortOrder: 'desc',
      sortBy: 'createdAt',
      search: 'nonexistent',
    });

    expect(query.andWhere).toHaveBeenNthCalledWith(
      1,
      'vehicle.linkedCitizenId = :citizenId',
      { citizenId: CITIZEN_ID },
    );
    expect(result).toEqual({
      data: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
  });

  it("does not include another citizen's matching manufacture year", async () => {
    const repository = createRepository();
    const query = createListQuery([], 0);
    repository.createQueryBuilder.mockReturnValue(query);
    const service = createService(repository);

    const result = await service.listCitizenVehicles(CITIZEN_ID, {
      page: 1,
      limit: 20,
      sortOrder: 'desc',
      sortBy: 'createdAt',
      search: '2021',
    });

    expect(query.andWhere).toHaveBeenNthCalledWith(
      1,
      'vehicle.linkedCitizenId = :citizenId',
      { citizenId: CITIZEN_ID },
    );
    expect(query.andWhere).toHaveBeenNthCalledWith(
      2,
      '(vehicle.plateNumber ILIKE :searchText0 OR vehicle.registrationNumber ILIKE :searchText0 OR vehicle.make ILIKE :searchText0 OR vehicle.model ILIKE :searchText0 OR CAST(vehicle.manufactureYear AS TEXT) = :searchYear0)',
      { searchText0: '%2021%', searchYear0: '2021' },
    );
    expect(result.data).toEqual([]);
  });

  it('looks up a citizen vehicle by normalized chassis number', async () => {
    const repository = createRepository();
    const query = createListQuery();
    repository.createQueryBuilder.mockReturnValue(query);
    const service = createService(repository);

    await service.listCitizenVehicles(CITIZEN_ID, {
      page: 1,
      limit: 20,
      sortOrder: 'desc',
      sortBy: 'createdAt',
      chassisNumber: ' ch  123 ',
    });

    expect(query.andWhere).toHaveBeenCalledWith(
      'vehicle.chassisNumber = :chassisNumber',
      { chassisNumber: 'CH 123' },
    );
  });

  it('combines chassis number and first registration date lookup filters', async () => {
    const repository = createRepository();
    const query = createListQuery();
    repository.createQueryBuilder.mockReturnValue(query);
    const service = createService(repository);

    await service.listCitizenVehicles(CITIZEN_ID, {
      page: 1,
      limit: 20,
      sortOrder: 'desc',
      sortBy: 'createdAt',
      chassisNumber: ' ch-123 ',
      firstRegistrationDate: '2020-01-01',
    });

    expect(query.andWhere).toHaveBeenCalledWith(
      'vehicle.chassisNumber = :chassisNumber',
      { chassisNumber: 'CH-123' },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      'vehicle.firstRegistrationDate = :firstRegistrationDate',
      { firstRegistrationDate: '2020-01-01' },
    );
  });

  it('returns no result for a non-matching first registration date while retaining citizen ownership scoping', async () => {
    const repository = createRepository();
    const query = createListQuery([], 0);
    repository.createQueryBuilder.mockReturnValue(query);
    const service = createService(repository);

    const result = await service.listCitizenVehicles(CITIZEN_ID, {
      page: 1,
      limit: 20,
      sortOrder: 'desc',
      sortBy: 'createdAt',
      firstRegistrationDate: '1999-01-01',
    });

    expect(query.andWhere).toHaveBeenCalledWith(
      'vehicle.linkedCitizenId = :citizenId',
      { citizenId: CITIZEN_ID },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      'vehicle.firstRegistrationDate = :firstRegistrationDate',
      { firstRegistrationDate: '1999-01-01' },
    );
    expect(result.data).toEqual([]);
  });

  it('looks up a citizen vehicle by complete provincial plate identity', async () => {
    const repository = createRepository();
    const query = createListQuery();
    repository.createQueryBuilder.mockReturnValue(query);
    const service = createService(repository);

    await service.listCitizenVehicles(CITIZEN_ID, {
      page: 1,
      limit: 20,
      sortOrder: 'desc',
      sortBy: 'createdAt',
      plateCategory: VehiclePlateCategory.PROVINCE,
      plateProvince: ' áž—áŸ’áž“áŸ†áž–áŸáž‰ ',
      plateNumber: ' 2ab-3146 ',
    });

    expect(query.andWhere).toHaveBeenCalledWith(
      'vehicle.plateCategory = :plateCategory',
      { plateCategory: VehiclePlateCategory.PROVINCE },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      'vehicle.plateProvince = :plateProvince',
      { plateProvince: 'áž—áŸ’áž“áŸ†áž–áŸáž‰' },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      'vehicle.plateNumber = :plateNumber',
      { plateNumber: '2AB-3146' },
    );
  });

  it('looks up a citizen vehicle by personalized Cambodia plate identity', async () => {
    const repository = createRepository();
    const query = createListQuery();
    repository.createQueryBuilder.mockReturnValue(query);
    const service = createService(repository);

    await service.listCitizenVehicles(CITIZEN_ID, {
      page: 1,
      limit: 20,
      sortOrder: 'desc',
      sortBy: 'createdAt',
      plateCategory: VehiclePlateCategory.PERSONALIZED_CAMBODIA,
      plateNumber: ' tq.aa.a1 ',
    });

    expect(query.andWhere).toHaveBeenCalledWith(
      'vehicle.plateCategory = :plateCategory',
      { plateCategory: VehiclePlateCategory.PERSONALIZED_CAMBODIA },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      'vehicle.plateNumber = :plateNumber',
      { plateNumber: 'TQ.AA.A1' },
    );
    expect(query.andWhere).not.toHaveBeenCalledWith(
      'vehicle.plateProvince = :plateProvince',
      expect.anything(),
    );
  });

  it('returns no match while retaining the citizen ownership predicate', async () => {
    const repository = createRepository();
    const query = createListQuery([], 0);
    repository.createQueryBuilder.mockReturnValue(query);
    const service = createService(repository);

    const result = await service.listCitizenVehicles(CITIZEN_ID, {
      page: 1,
      limit: 20,
      sortOrder: 'desc',
      sortBy: 'createdAt',
      registrationNumber: 'NO-MATCH',
    });

    expect(query.andWhere).toHaveBeenCalledWith(
      'vehicle.linkedCitizenId = :citizenId',
      { citizenId: CITIZEN_ID },
    );
    expect(result).toEqual({
      data: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
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
    expect(mapped).not.toHaveProperty('engineNumber');
  });

  it('loads technical master data only for a vehicle detail query', async () => {
    const repository = createRepository();
    const query = createListQuery();
    repository.createQueryBuilder.mockReturnValue(query);
    query.getOne.mockResolvedValue(vehicle({ engineNumber: 'ENGINE-123' }));
    const service = createService(repository);

    const result = await service.getAdminVehicle(VEHICLE_ID);

    expect(query.addSelect).toHaveBeenCalledWith(
      expect.arrayContaining([
        'vehicle.colour',
        'vehicle.engineNumber',
        'vehicle.maximumGrossWeightKg',
        'vehicle.heightMm',
      ]),
    );
    expect(result.engineNumber).toBe('ENGINE-123');
  });

  it('updates and normalizes authoritative technical master data', async () => {
    const repository = createRepository();
    const query = createListQuery();
    const existing = vehicle();
    repository.createQueryBuilder.mockReturnValue(query);
    repository.save.mockImplementation((value) => Promise.resolve(value));
    query.getOne.mockResolvedValue(existing);
    const service = createService(repository);

    const result = await service.updateTechnicalData(VEHICLE_ID, {
      colour: ' White ',
      engineNumber: ' eng  123 ',
      numberOfCylinders: 4,
      engineDisplacementCc: 2199,
      enginePowerHp: '177.50',
      fuelType: ' Diesel ',
      numberOfSeats: 11,
      numberOfAxles: 2,
      steering: ' Left ',
      vehicleWeightKg: 2200,
      maximumLoadKg: 220,
      maximumGrossWeightKg: 2970,
      wheelSize: ' 215/60R17 ',
      lengthMm: 5250,
      widthMm: 2000,
      heightMm: 1900,
    });

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        colour: 'White',
        engineNumber: 'ENG 123',
        enginePowerHp: '177.50',
        fuelType: 'Diesel',
        steering: 'Left',
        wheelSize: '215/60R17',
        lengthMm: 5250,
      }),
    );
    expect(result).toMatchObject({
      colour: 'White',
      engineNumber: 'ENG 123',
      enginePowerHp: '177.50',
    });
  });

  it('supports partial clearing without changing omitted fields', async () => {
    const repository = createRepository();
    const query = createListQuery();
    const existing = vehicle({
      colour: 'White',
      engineNumber: 'ENG-123',
      numberOfSeats: 5,
    });
    repository.createQueryBuilder.mockReturnValue(query);
    repository.save.mockImplementation((value) => Promise.resolve(value));
    query.getOne.mockResolvedValue(existing);
    const service = createService(repository);

    const result = await service.updateTechnicalData(VEHICLE_ID, {
      colour: null,
      numberOfSeats: 7,
    });

    expect(result).toMatchObject({
      colour: null,
      engineNumber: 'ENG-123',
      numberOfSeats: 7,
    });
  });

  it('keeps engine number independent from chassis number', async () => {
    const repository = createRepository();
    const query = createListQuery();
    const existing = vehicle({ chassisNumber: 'CHASSIS-123' });
    repository.createQueryBuilder.mockReturnValue(query);
    repository.save.mockImplementation((value) => Promise.resolve(value));
    query.getOne.mockResolvedValue(existing);
    const service = createService(repository);

    const result = await service.updateTechnicalData(VEHICLE_ID, {
      engineNumber: 'ENGINE-987',
    });

    expect(result.engineNumber).toBe('ENGINE-987');
    expect(result.chassisNumber).toBe('CHASSIS-123');
  });

  it('rejects an empty technical update and reports missing vehicles', async () => {
    const repository = createRepository();
    const query = createListQuery();
    repository.createQueryBuilder.mockReturnValue(query);
    const service = createService(repository);

    await expect(
      service.updateTechnicalData(VEHICLE_ID, {}),
    ).rejects.toMatchObject({
      code: ApiErrorCode.VALIDATION_ERROR,
      status: HttpStatus.BAD_REQUEST,
    });

    query.getOne.mockResolvedValue(null);
    await expect(
      service.updateTechnicalData(VEHICLE_ID, { colour: 'White' }),
    ).rejects.toMatchObject({
      code: ApiErrorCode.VEHICLE_NOT_FOUND,
      status: HttpStatus.NOT_FOUND,
    });
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

function createListQuery(vehicles: Vehicle[] = [vehicle()], total = 1) {
  return {
    leftJoinAndMapOne: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
    getManyAndCount: jest.fn().mockResolvedValue([vehicles, total]),
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
    colour: null,
    engineNumber: null,
    numberOfCylinders: null,
    engineDisplacementCc: null,
    enginePowerHp: null,
    fuelType: null,
    numberOfSeats: null,
    numberOfAxles: null,
    steering: null,
    vehicleWeightKg: null,
    maximumLoadKg: null,
    maximumGrossWeightKg: null,
    wheelSize: null,
    lengthMm: null,
    widthMm: null,
    heightMm: null,
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
