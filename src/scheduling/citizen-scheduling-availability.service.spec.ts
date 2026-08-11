import 'reflect-metadata';

import { HttpStatus } from '@nestjs/common';

import { ApiErrorCode } from '../common/errors/api-error-code';
import { CitizenSchedulingAvailabilityService } from './citizen-scheduling-availability.service';
import { InspectionStationDailyCapacity } from './entities/inspection-station-daily-capacity.entity';
import { InspectionStation } from './entities/inspection-station.entity';

const STATION_ID = '11111111-1111-4111-8111-111111111111';
const DATE = '2026-08-12';

describe('CitizenSchedulingAvailabilityService', () => {
  it('lists only active stations in deterministic code and id order', async () => {
    const fixture = createFixture();
    const activeStation = station();
    fixture.stations.find.mockResolvedValue([activeStation]);

    await expect(fixture.service.listActiveStations()).resolves.toEqual([
      activeStation,
    ]);
    expect(fixture.stations.find).toHaveBeenCalledWith({
      where: { isActive: true },
      order: { code: 'ASC', id: 'ASC' },
    });
  });

  it('lists future, open, non-full dates in ascending order without capacity details', async () => {
    const fixture = createFixture();
    fixture.queryState.getManyResult = [
      capacity({ capacityDate: '2026-08-12' }),
      capacity({ id: 'capacity-2', capacityDate: '2026-08-14' }),
    ];

    await expect(
      fixture.service.listSelectableDates(STATION_ID),
    ).resolves.toEqual([
      { stationId: STATION_ID, capacityDate: '2026-08-12' },
      { stationId: STATION_ID, capacityDate: '2026-08-14' },
    ]);
    expect(fixture.query.conditions).toEqual(
      expect.arrayContaining([
        'station.isActive = true',
        "capacity.capacityDate > ((now() AT TIME ZONE 'Asia/Phnom_Penh')::date)",
        'capacity.isClosed = false',
        'capacity.reservedCount < capacity.dailyCapacity',
      ]),
    );
    expect(fixture.queryState.orderBy).toEqual({
      field: 'capacity.capacityDate',
      direction: 'ASC',
    });
  });

  it('rejects a requested inactive or missing station before listing dates', async () => {
    const fixture = createFixture();
    fixture.stations.findOne.mockResolvedValue(null);

    await expect(
      fixture.service.listSelectableDates(STATION_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.STATION_NOT_FOUND,
      status: HttpStatus.NOT_FOUND,
    });
    expect(fixture.dailyCapacities.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('returns the current selectable capacity after one availability query', async () => {
    const fixture = createFixture();
    const available = capacity();
    fixture.queryState.getOneResult = available;

    await expect(
      fixture.service.validateSelectable(STATION_ID, DATE),
    ).resolves.toBe(available);
    expect(fixture.query.conditions).toContain(
      'capacity.capacityDate = :capacityDate',
    );
    expect(fixture.stations.findOne).not.toHaveBeenCalled();
  });

  it.each([
    'missing capacity row',
    'today',
    'past date',
    'closed date',
    'full date',
  ])('rejects an unavailable date caused by %s', async () => {
    const fixture = createFixture();
    fixture.queryState.getOneResult = null;

    await expect(
      fixture.service.validateSelectable(STATION_ID, DATE),
    ).rejects.toMatchObject({
      code: ApiErrorCode.CONFLICT,
      status: HttpStatus.CONFLICT,
    });
  });

  it('rejects an inactive station during validation', async () => {
    const fixture = createFixture();
    fixture.queryState.getOneResult = null;
    fixture.stations.findOne.mockResolvedValue(null);

    await expect(
      fixture.service.validateSelectable(STATION_ID, DATE),
    ).rejects.toMatchObject({
      code: ApiErrorCode.STATION_NOT_FOUND,
      status: HttpStatus.NOT_FOUND,
    });
  });

  it('can validate through a caller-owned transaction manager', async () => {
    const fixture = createFixture();
    fixture.queryState.getOneResult = capacity();
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === InspectionStation) return fixture.stations;
        if (entity === InspectionStationDailyCapacity)
          return fixture.dailyCapacities;
        throw new Error('Unexpected repository');
      }),
    };

    await expect(
      fixture.service.validateSelectableWithManager(
        manager as never,
        STATION_ID,
        DATE,
      ),
    ).resolves.toMatchObject({ id: 'capacity-id' });
  });
});

interface AvailabilityQuery {
  innerJoin(path: string, alias: string): AvailabilityQuery;
  where(clause: string, parameters: Record<string, string>): AvailabilityQuery;
  andWhere(
    clause: string,
    parameters?: Record<string, string>,
  ): AvailabilityQuery;
  orderBy(field: string, direction: 'ASC'): AvailabilityQuery;
  getMany(): Promise<InspectionStationDailyCapacity[]>;
  getOne(): Promise<InspectionStationDailyCapacity | null>;
}

function createFixture() {
  const queryState: {
    getManyResult: InspectionStationDailyCapacity[];
    getOneResult: InspectionStationDailyCapacity | null;
    orderBy: { field: string; direction: 'ASC' } | null;
  } = {
    getManyResult: [],
    getOneResult: null,
    orderBy: null,
  };
  const query: AvailabilityQuery & { conditions: string[] } = {
    conditions: [] as string[],
    innerJoin: () => query,
    where: () => query,
    andWhere: (clause: string) => {
      query.conditions.push(clause);
      return query;
    },
    orderBy: (field: string, direction: 'ASC') => {
      queryState.orderBy = { field, direction };
      return query;
    },
    getMany: () => Promise.resolve(queryState.getManyResult),
    getOne: () => Promise.resolve(queryState.getOneResult),
  };
  const stations = {
    find: jest.fn(),
    findOne: jest.fn().mockResolvedValue(station()),
  };
  const dailyCapacities = {
    createQueryBuilder: jest.fn().mockReturnValue(query),
  };

  return {
    service: new CitizenSchedulingAvailabilityService(
      stations as never,
      dailyCapacities as never,
    ),
    stations,
    dailyCapacities,
    query,
    queryState,
  };
}

function station(
  overrides: Partial<InspectionStation> = {},
): InspectionStation {
  return {
    id: STATION_ID,
    code: 'PP-01',
    nameKh: 'Station Khmer',
    nameEn: 'Station English',
    province: 'Phnom Penh',
    address: 'Address',
    phone: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function capacity(
  overrides: Partial<InspectionStationDailyCapacity> = {},
): InspectionStationDailyCapacity {
  return {
    id: 'capacity-id',
    stationId: STATION_ID,
    capacityDate: DATE,
    dailyCapacity: 30,
    reservedCount: 0,
    isClosed: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
