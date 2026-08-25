import 'reflect-metadata';

import { HttpStatus } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import { ApiErrorCode } from '../common/errors/api-error-code';
import { CitizenPreferredSchedulingService } from './citizen-preferred-scheduling.service';
import { InspectionStationDailyCapacity } from './entities/inspection-station-daily-capacity.entity';
import { InspectionStation } from './entities/inspection-station.entity';

const STATION_ID = '11111111-1111-4111-8111-111111111111';

describe('CitizenPreferredSchedulingService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-24T05:00:00.000Z'));
  });

  afterEach(() => jest.useRealTimers());

  it('generates weekdays from tomorrow through the inclusive configured boundary, excluding explicit closures', async () => {
    const fixture = createFixture();
    fixture.dailyCapacities.find.mockResolvedValue([
      capacity({ capacityDate: '2026-08-26', isClosed: true }),
    ]);

    await expect(
      fixture.service.listPreferredDates(STATION_ID),
    ).resolves.toEqual(
      expect.arrayContaining([
        { stationId: STATION_ID, capacityDate: '2026-08-25' },
        { stationId: STATION_ID, capacityDate: '2026-08-27' },
        { stationId: STATION_ID, capacityDate: '2026-10-23' },
      ]),
    );
    const dates = await fixture.service.listPreferredDates(STATION_ID);
    expect(dates).not.toEqual(
      expect.arrayContaining([
        { stationId: STATION_ID, capacityDate: '2026-08-24' },
        { stationId: STATION_ID, capacityDate: '2026-08-26' },
        { stationId: STATION_ID, capacityDate: '2026-08-29' },
        { stationId: STATION_ID, capacityDate: '2026-08-30' },
        { stationId: STATION_ID, capacityDate: '2026-10-24' },
      ]),
    );
  });

  it('allows unconfigured and full-but-open weekdays as preferences', async () => {
    const fixture = createFixture();

    await expect(
      fixture.service.validatePreferredDateWithManager(
        fixture.manager,
        STATION_ID,
        '2026-08-25',
      ),
    ).resolves.toBeUndefined();
    await expect(
      fixture.service.validatePreferredDateWithManager(
        fixture.manager,
        STATION_ID,
        '2026-08-27',
      ),
    ).resolves.toBeUndefined();
    expect(fixture.dailyCapacities.findOne).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['today', '2026-08-24'],
    ['weekend', '2026-08-29'],
    ['day 61', '2026-10-24'],
  ])('rejects %s as a preferred date', async (_reason, capacityDate) => {
    const fixture = createFixture();

    await expect(
      fixture.service.validatePreferredDateWithManager(
        fixture.manager,
        STATION_ID,
        capacityDate,
      ),
    ).rejects.toMatchObject({
      code: ApiErrorCode.CONFLICT,
      status: HttpStatus.CONFLICT,
    });
  });

  it('rejects an explicitly closed weekday', async () => {
    const fixture = createFixture();
    fixture.dailyCapacities.findOne.mockResolvedValue(
      capacity({ isClosed: true }),
    );

    await expect(
      fixture.service.validatePreferredDateWithManager(
        fixture.manager,
        STATION_ID,
        '2026-08-25',
      ),
    ).rejects.toMatchObject({ code: ApiErrorCode.CONFLICT });
  });

  it('rejects an inactive station', async () => {
    const fixture = createFixture();
    fixture.stations.findOne.mockResolvedValue(null);

    await expect(
      fixture.service.listPreferredDates(STATION_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.STATION_NOT_FOUND,
      status: HttpStatus.NOT_FOUND,
    });
  });
});

function createFixture() {
  const stations = {
    findOne: jest.fn().mockResolvedValue(station()),
  };
  const dailyCapacities = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
  };
  const manager = {
    getRepository: jest.fn((entity) => {
      if (entity === InspectionStation) return stations;
      if (entity === InspectionStationDailyCapacity) return dailyCapacities;
      throw new Error('Unexpected repository');
    }),
  };
  const configService = {
    getOrThrow: jest.fn().mockReturnValue(60),
  };

  return {
    service: new CitizenPreferredSchedulingService(
      stations as never,
      dailyCapacities as never,
      configService as unknown as ConfigService,
    ),
    stations,
    dailyCapacities,
    manager: manager as never,
  };
}

function station(): InspectionStation {
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
  };
}

function capacity(
  overrides: Partial<InspectionStationDailyCapacity> = {},
): InspectionStationDailyCapacity {
  return {
    id: 'capacity-id',
    stationId: STATION_ID,
    capacityDate: '2026-08-25',
    dailyCapacity: 1,
    reservedCount: 1,
    isClosed: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
