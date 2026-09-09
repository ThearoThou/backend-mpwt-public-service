import type { DataSource, EntityManager } from 'typeorm';

import {
  seedFixtures,
  stationFixtures,
  type StationFixture,
} from '../../scripts/seed-local-inspection-stations';
import { InspectionStationDailyCapacity } from './entities/inspection-station-daily-capacity.entity';
import { InspectionStation } from './entities/inspection-station.entity';

describe('local demo inspection station reference data', () => {
  it('defines exactly 22 unique target stations split across Phnom Penh and provinces', () => {
    const codes = stationFixtures.map((station) => station.code);
    const phnomPenhStations = stationFixtures.filter(
      (station) => station.province === 'Phnom Penh',
    );

    expect(stationFixtures).toHaveLength(22);
    expect(phnomPenhStations).toHaveLength(8);
    expect(stationFixtures.length - phnomPenhStations.length).toBe(14);
    expect(new Set(codes).size).toBe(22);
    expect(stationFixtures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PP-SEN-SOK',
          nameKh: 'សែនសុខ',
          nameEn: 'Sen Sok',
          province: 'Phnom Penh',
          address: 'Sen Sok, Phnom Penh',
        }),
      ]),
    );
  });

  it('seeds by stable code idempotently and preserves existing station records', async () => {
    const fixture = createSeedFixture();

    const first = await seedFixtures(fixture.source);
    const firstStations = new Map(
      [...fixture.stations].map(([code, station]) => [code, { ...station }]),
    );
    const second = await seedFixtures(fixture.source);

    expect(first.stationsCreated).toHaveLength(22);
    expect(fixture.stations.size).toBe(22);
    expect(second.stationsCreated).toHaveLength(0);
    expect(second.stationsUpdated).toHaveLength(0);
    expect(second.stationsSkipped).toHaveLength(22);
    expect(new Map(fixture.stations)).toEqual(firstStations);
    expect(fixture.stations.get('PP-SEN-SOK')).toMatchObject({
      isActive: true,
      phone: null,
    });
  });

  it('adds only Sen Sok when the existing 21 target stations are present', async () => {
    const existingFixtures = stationFixtures.filter(
      (station) => station.code !== 'PP-SEN-SOK',
    );
    const fixture = createSeedFixture(existingFixtures);
    const existingIds = new Map(
      [...fixture.stations].map(([code, station]) => [code, station.id]),
    );

    const result = await seedFixtures(fixture.source);

    expect(result.stationsCreated).toEqual(['PP-SEN-SOK']);
    expect(result.stationsSkipped).toHaveLength(21);
    expect(fixture.stations.size).toBe(22);
    existingIds.forEach((id, code) => {
      expect(fixture.stations.get(code)?.id).toBe(id);
    });
  });
});

interface StoredStation extends StationFixture {
  id: string;
  phone: null;
  isActive: boolean;
}

interface StoredCapacity {
  stationId: string;
  capacityDate: string;
  dailyCapacity: number;
  reservedCount: number;
  isClosed: boolean;
}

function createSeedFixture(existingFixtures: readonly StationFixture[] = []): {
  source: DataSource;
  stations: Map<string, StoredStation>;
} {
  const stations = new Map<string, StoredStation>(
    existingFixtures.map((station) => [
      station.code,
      {
        ...station,
        id: `existing-${station.code}`,
        phone: null,
        isActive: true,
      },
    ]),
  );
  const capacities = new Map<string, StoredCapacity>();
  let nextStationId = 1;

  const stationRepository = {
    findOneBy: jest.fn(
      ({ code }: { code: string }) => stations.get(code) ?? null,
    ),
    create: jest.fn((value: Omit<StoredStation, 'id'>) => value),
    merge: jest.fn((existing: StoredStation, value: Partial<StoredStation>) =>
      Object.assign(existing, value),
    ),
    save: jest.fn((value: Omit<StoredStation, 'id'> | StoredStation) => {
      const stored: StoredStation = {
        ...value,
        id: 'id' in value ? value.id : `station-${nextStationId++}`,
      };
      stations.set(stored.code, stored);
      return stored;
    }),
  };
  const capacityRepository = {
    findOneBy: jest.fn(
      ({ stationId, capacityDate }: StoredCapacity) =>
        capacities.get(`${stationId}:${capacityDate}`) ?? null,
    ),
    create: jest.fn((value: StoredCapacity) => value),
    save: jest.fn((value: StoredCapacity) => {
      capacities.set(`${value.stationId}:${value.capacityDate}`, value);
      return value;
    }),
  };
  const manager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === InspectionStation) return stationRepository;
      if (entity === InspectionStationDailyCapacity) return capacityRepository;
      throw new Error('Unexpected repository requested by station seed.');
    }),
  } as unknown as EntityManager;
  const source = {
    transaction: jest.fn(
      (callback: (current: EntityManager) => Promise<unknown>) =>
        callback(manager),
    ),
  } as unknown as DataSource;

  return { source, stations };
}
