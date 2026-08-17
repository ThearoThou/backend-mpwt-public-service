import 'reflect-metadata';

import { HttpStatus } from '@nestjs/common';

import { ApiErrorCode } from '../common/errors/api-error-code';
import { InspectionStationDailyCapacity } from './entities/inspection-station-daily-capacity.entity';
import { InspectionStationDailyCapacityService } from './inspection-station-daily-capacity.service';

const STATION_ID = '11111111-1111-4111-8111-111111111111';
const DAILY_CAPACITY_ID = '22222222-2222-4222-822222222222';

interface DailyCapacitySetValues {
  dailyCapacity?: number;
  reservedCount?: number;
  updatedAt?: () => string;
}

interface GuardedUpdateQuery {
  affected: number;
  conditions: Array<{ clause: string; parameters: Record<string, number> }>;
  update(): GuardedUpdateQuery;
  set(values: DailyCapacitySetValues): GuardedUpdateQuery;
  where(clause: string, parameters: Record<string, string>): GuardedUpdateQuery;
  andWhere(
    clause: string,
    parameters: Record<string, number>,
  ): GuardedUpdateQuery;
  returning(columns: string[]): GuardedUpdateQuery;
  execute(): Promise<{ affected: number }>;
}

describe('InspectionStationDailyCapacityService', () => {
  it('uses one manager-bound guarded SQL update to reserve exactly one daily capacity unit', async () => {
    const fixture = createFixture();
    const reserved = {
      id: DAILY_CAPACITY_ID,
      stationId: STATION_ID,
      capacityDate: '2026-08-12',
    };
    let queryText = '';
    const manager = {
      query: jest.fn((sql: string) => {
        queryText = sql;
        return Promise.resolve([[reserved], 1]);
      }),
    };

    await expect(
      fixture.service.reserveDailyCapacityWithManager(
        manager as never,
        STATION_ID,
        '2026-08-12',
      ),
    ).resolves.toEqual(reserved);
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining(
        '"reserved_count" = capacity."reserved_count" + 1',
      ),
      [STATION_ID, '2026-08-12'],
    );
    expect(queryText).toEqual(
      expect.stringContaining('station."is_active" = true'),
    );
    expect(queryText).toEqual(
      expect.stringContaining(
        'capacity."capacity_date" > ((now() AT TIME ZONE \'Asia/Phnom_Penh\')::date)',
      ),
    );
    expect(queryText).toEqual(
      expect.stringContaining(
        'capacity."reserved_count" < capacity."daily_capacity"',
      ),
    );
    expect(queryText).toEqual(
      expect.stringContaining(
        'capacity."capacity_date"::text AS "capacityDate"',
      ),
    );
    expect(typeof reserved.capacityDate).toBe('string');
  });

  it('returns null when the guarded reservation update finds no reservable capacity', async () => {
    const fixture = createFixture();
    const manager = { query: jest.fn().mockResolvedValue([[], 0]) };

    await expect(
      fixture.service.reserveDailyCapacityWithManager(
        manager as never,
        STATION_ID,
        '2026-08-12',
      ),
    ).resolves.toBeNull();
  });

  it('creates an open daily capacity with backend-controlled reserved count', async () => {
    const fixture = createFixture();
    fixture.stations.existsBy.mockResolvedValue(true);
    const created = capacity();
    fixture.dailyCapacities.save.mockResolvedValue(created);
    const service = fixture.service;

    const result = await service.create({
      stationId: STATION_ID,
      capacityDate: '2026-08-12',
      dailyCapacity: 30,
      reservedCount: 99,
    } as never);

    expect(result).toBe(created);
    expect(fixture.dailyCapacities.create).toHaveBeenCalledWith({
      stationId: STATION_ID,
      capacityDate: '2026-08-12',
      dailyCapacity: 30,
      reservedCount: 0,
      isClosed: false,
    });
  });

  it.each([0, -1, 1.5])('rejects invalid daily capacity %s', async (value) => {
    const fixture = createFixture();

    await expect(
      fixture.service.create({
        stationId: STATION_ID,
        capacityDate: '2026-08-12',
        dailyCapacity: value,
      }),
    ).rejects.toMatchObject({
      code: ApiErrorCode.VALIDATION_ERROR,
      status: HttpStatus.BAD_REQUEST,
    });
    expect(fixture.stations.existsBy).not.toHaveBeenCalled();
  });

  it('rejects an unknown station during creation', async () => {
    const fixture = createFixture();
    fixture.stations.existsBy.mockResolvedValue(false);

    await expect(fixture.service.create(createInput())).rejects.toMatchObject({
      code: ApiErrorCode.STATION_NOT_FOUND,
      status: HttpStatus.NOT_FOUND,
    });
  });

  it('maps the station/date unique violation to a conflict', async () => {
    const fixture = createFixture();
    fixture.stations.existsBy.mockResolvedValue(true);
    fixture.dailyCapacities.save.mockRejectedValue({
      code: '23505',
      constraint: 'uq_inspection_station_daily_capacities_station_date',
    });

    await expect(fixture.service.create(createInput())).rejects.toMatchObject({
      code: ApiErrorCode.CONFLICT,
      status: HttpStatus.CONFLICT,
    });
  });

  it('lists all records or records for one station', async () => {
    const fixture = createFixture();
    fixture.dailyCapacities.find.mockResolvedValue([capacity()]);

    await expect(fixture.service.list()).resolves.toEqual([capacity()]);
    expect(fixture.dailyCapacities.find).toHaveBeenLastCalledWith({
      order: { capacityDate: 'ASC', id: 'ASC' },
    });

    await fixture.service.list(STATION_ID);
    expect(fixture.dailyCapacities.find).toHaveBeenLastCalledWith({
      where: { stationId: STATION_ID },
      order: { capacityDate: 'ASC', id: 'ASC' },
    });
  });

  it('gets a record and reports a missing record', async () => {
    const fixture = createFixture();
    fixture.dailyCapacities.findOne.mockResolvedValueOnce(capacity());

    await expect(fixture.service.getById(DAILY_CAPACITY_ID)).resolves.toEqual(
      capacity(),
    );

    fixture.dailyCapacities.findOne.mockResolvedValueOnce(null);
    await expect(
      fixture.service.getById(DAILY_CAPACITY_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.RESOURCE_NOT_FOUND,
      status: HttpStatus.NOT_FOUND,
    });
  });

  it.each([30, 25, 18])(
    'updates daily capacity to %s when the guarded update succeeds',
    async (dailyCapacity) => {
      const fixture = createFixture();
      const updated = capacity({ dailyCapacity });
      fixture.dailyCapacities.findOne.mockResolvedValue(updated);

      await expect(
        fixture.service.updateDailyCapacity(DAILY_CAPACITY_ID, dailyCapacity),
      ).resolves.toEqual(updated);

      expect(fixture.query.conditions).toEqual([
        { clause: ':dailyCapacity > 0', parameters: { dailyCapacity } },
        {
          clause: ':dailyCapacity >= "reserved_count"',
          parameters: { dailyCapacity },
        },
      ]);
      expect(fixture.setArguments).toEqual([
        expect.objectContaining({ dailyCapacity }),
      ]);
      expect(fixture.dailyCapacities.existsBy).not.toHaveBeenCalled();
    },
  );

  it('rejects a guarded decrease below reserved count without changing it', async () => {
    const fixture = createFixture();
    fixture.query.affected = 0;
    fixture.dailyCapacities.existsBy.mockResolvedValue(true);

    await expect(
      fixture.service.updateDailyCapacity(DAILY_CAPACITY_ID, 17),
    ).rejects.toMatchObject({
      code: ApiErrorCode.CONFLICT,
      status: HttpStatus.CONFLICT,
    });
    expect(fixture.setArguments[0]).toMatchObject({ dailyCapacity: 17 });
    expect(fixture.setArguments[0]).not.toHaveProperty('reservedCount');
  });

  it.each([0, -1, 1.5])(
    'rejects invalid daily capacity update %s before guarded SQL',
    async (dailyCapacity) => {
      const fixture = createFixture();

      await expect(
        fixture.service.updateDailyCapacity(DAILY_CAPACITY_ID, dailyCapacity),
      ).rejects.toMatchObject({
        code: ApiErrorCode.VALIDATION_ERROR,
        status: HttpStatus.BAD_REQUEST,
      });
      expect(fixture.dailyCapacities.createQueryBuilder).not.toHaveBeenCalled();
    },
  );

  it('reports an unknown record when guarded update affects no rows', async () => {
    const fixture = createFixture();
    fixture.query.affected = 0;
    fixture.dailyCapacities.existsBy.mockResolvedValue(false);

    await expect(
      fixture.service.updateDailyCapacity(DAILY_CAPACITY_ID, 30),
    ).rejects.toMatchObject({
      code: ApiErrorCode.RESOURCE_NOT_FOUND,
      status: HttpStatus.NOT_FOUND,
    });
  });

  it.each([
    ['closeDailyCapacity', true],
    ['reopenDailyCapacity', false],
  ] as const)(
    '%s updates only the closed flag idempotently',
    async (method, isClosed) => {
      const fixture = createFixture();
      const unchangedCount = capacity({ isClosed });
      fixture.dailyCapacities.findOne.mockResolvedValue(unchangedCount);

      await expect(fixture.service[method](DAILY_CAPACITY_ID)).resolves.toEqual(
        unchangedCount,
      );
      expect(fixture.dailyCapacities.update).toHaveBeenCalledWith(
        { id: DAILY_CAPACITY_ID },
        { isClosed },
      );
      expect(fixture.updateArguments).toEqual([
        {
          criteria: { id: DAILY_CAPACITY_ID },
          values: { isClosed },
        },
      ]);
    },
  );

  it('reports a missing record when closing or reopening', async () => {
    const fixture = createFixture();
    fixture.updateState.affected = 0;

    await expect(
      fixture.service.closeDailyCapacity(DAILY_CAPACITY_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.RESOURCE_NOT_FOUND,
      status: HttpStatus.NOT_FOUND,
    });
  });
});

function createFixture() {
  const setArguments: DailyCapacitySetValues[] = [];
  const updateArguments: Array<{
    criteria: { id: string };
    values: { isClosed: boolean; reservedCount?: number };
  }> = [];
  const query: GuardedUpdateQuery = {
    affected: 1,
    conditions: [],
    update: () => query,
    set: (values) => {
      setArguments.push(values);
      return query;
    },
    where: () => query,
    andWhere: (clause, parameters) => {
      query.conditions.push({ clause, parameters });
      return query;
    },
    returning: () => query,
    execute: () => Promise.resolve({ affected: query.affected }),
  };
  const updateState = { affected: 1 };

  const dailyCapacities = {
    find: jest.fn(),
    findOne: jest.fn(),
    existsBy: jest.fn(),
    create: jest.fn((value) => value as InspectionStationDailyCapacity),
    save: jest.fn(),
    update: jest.fn(
      (
        criteria: { id: string },
        values: { isClosed: boolean; reservedCount?: number },
      ) => {
        updateArguments.push({ criteria, values });
        return Promise.resolve({ affected: updateState.affected });
      },
    ),
    createQueryBuilder: jest.fn().mockReturnValue(query),
  };
  const stations = { existsBy: jest.fn() };

  return {
    service: new InspectionStationDailyCapacityService(
      dailyCapacities as never,
      stations as never,
    ),
    dailyCapacities,
    stations,
    query,
    setArguments,
    updateArguments,
    updateState,
  };
}

function createInput() {
  return {
    stationId: STATION_ID,
    capacityDate: '2026-08-12',
    dailyCapacity: 30,
  };
}

function capacity(
  overrides: Partial<InspectionStationDailyCapacity> = {},
): InspectionStationDailyCapacity {
  return {
    id: DAILY_CAPACITY_ID,
    stationId: STATION_ID,
    capacityDate: '2026-08-12',
    dailyCapacity: 30,
    reservedCount: 18,
    isClosed: false,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}
