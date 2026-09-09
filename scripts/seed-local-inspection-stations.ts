import { createRequire } from 'node:module';
import type { DataSource } from 'typeorm';

import { InspectionStationDailyCapacity } from '../src/scheduling/entities/inspection-station-daily-capacity.entity';
import { InspectionStation } from '../src/scheduling/entities/inspection-station.entity';

const LOCAL_SEED_ENVIRONMENT = 'development';
const LOCAL_SEED_CONFIRMATION = 'true';
const PHNOM_PENH_TIME_ZONE = 'Asia/Phnom_Penh';

let localDataSource: DataSource | undefined;
const requireFromScript = createRequire(__filename);

export interface StationFixture {
  code: string;
  nameKh: string;
  nameEn: string;
  province: string;
  address: string;
}

interface DailyCapacityFixture {
  stationCode: string;
  capacityDate: string;
  dailyCapacity: number;
  reservedCount: number;
  isClosed: boolean;
}

interface PreviousStationDisplay {
  code: string;
  nameKh: string;
  nameEn: string;
  address: string;
}

export interface SeedResult {
  stationsCreated: string[];
  stationsSkipped: string[];
  stationsUpdated: string[];
  capacitiesCreated: string[];
  capacitiesSkipped: string[];
}

export interface SeedOptions {
  includeCapacities?: boolean;
}

// Temporary/demo inspection station reference data for development/testing.
// Replace or update it when confirmed official MPWT station data is available.
export const stationFixtures: readonly StationFixture[] = [
  {
    code: 'PP-RUSSEY-KEO',
    nameKh: 'ទីតាំងឫស្សីកែវ',
    nameEn: 'Russey Keo Vehicle Technical Inspection',
    province: 'Phnom Penh',
    address: 'H.E. Chea Sophara Street',
  },
  {
    code: 'PP-NR6A',
    nameKh: 'ផ្លូវជាតិលេខ ៦A',
    nameEn: 'National Road 6A Vehicle Technical Inspection',
    province: 'Phnom Penh',
    address: 'National Road 6A',
  },
  {
    code: 'PP-MONG-RETHY',
    nameKh: 'បណ្តោយផ្លូវ ម៉ុង ឫទ្ធី (ក្បែរផ្សារបឹងបៃតង)',
    nameEn: 'Mong Rethy Vehicle Technical Inspection',
    province: 'Phnom Penh',
    address: 'Mong Rethy Road, near Boeng Baitang market',
  },
  {
    code: 'PP-CHAMKAR-DOUNG',
    nameKh: 'ចំការដូង',
    nameEn: 'Chamkar Doung Vehicle Technical Inspection',
    province: 'Phnom Penh',
    address: 'Chamkar Doung',
  },
  {
    code: 'PP-VEAL-SBOV',
    nameKh: 'វាលស្បូវផ្លូវជាតិលេខ ១',
    nameEn: 'Veal Sbov Vehicle Technical Inspection',
    province: 'Phnom Penh',
    address: 'Veal Sbov, National Road 1',
  },
  {
    code: 'PP-KAMBOL',
    nameKh: 'សាខាកំបូល (ផ្លូវជាតិលេខ៤)',
    nameEn: 'Kambol Vehicle Technical Inspection',
    province: 'Phnom Penh',
    address: 'Kambol, National Road 4',
  },
  {
    code: 'PP-POR-SEN-CHEY-ODEM',
    nameKh: 'មជ្ឈមណ្ឌលត្រួតពិនិត្យលក្ខណៈបច្ចេកទេសយានយន្ត ពោធិ៍សែនជ័យ-អូដឹម',
    nameEn: 'Po Sen Chey–Odem Vehicle Technical Inspection',
    province: 'Phnom Penh',
    address: 'Por Sen Chey District, Phnom Penh',
  },
  {
    code: 'PP-SEN-SOK',
    nameKh: 'សែនសុខ',
    nameEn: 'Sen Sok',
    province: 'Phnom Penh',
    address: 'Sen Sok, Phnom Penh',
  },
  {
    code: 'BTB-VEHICLE-INSPECTION',
    nameKh: 'មជ្ឈមណ្ឌលត្រួតពិនិត្យលក្ខណៈបច្ចេកទេសយានយន្ត ខេត្តបាត់ដំបង',
    nameEn: 'Battambang Vehicle Technical Inspection Centre',
    province: 'Battambang',
    address: 'Battambang Province',
  },
  {
    code: 'KPC-VEHICLE-INSPECTION',
    nameKh: 'មជ្ឈមណ្ឌលត្រួតពិនិត្យលក្ខណៈបច្ចេកទេសយានយន្ត ខេត្តកំពង់ចាម',
    nameEn: 'Kampong Cham Vehicle Technical Inspection Centre',
    province: 'Kampong Cham',
    address: 'Kampong Cham Province',
  },
  {
    code: 'SR-VEHICLE-INSPECTION',
    nameKh: 'មជ្ឈមណ្ឌលត្រួតពិនិត្យលក្ខណៈបច្ចេកទេសយានយន្ត ខេត្តសៀមរាប',
    nameEn: 'Siem Reap Vehicle Technical Inspection Centre',
    province: 'Siem Reap',
    address: 'Siem Reap Province',
  },
  {
    code: 'PSH-VEHICLE-INSPECTION',
    nameKh: 'មជ្ឈមណ្ឌលត្រួតពិនិត្យលក្ខណៈបច្ចេកទេសយានយន្ត ខេត្តព្រះសីហនុ',
    nameEn: 'Preah Sihanouk Vehicle Technical Inspection Centre',
    province: 'Preah Sihanouk',
    address: 'Preah Sihanouk Province',
  },
  {
    code: 'KPS-VEHICLE-INSPECTION',
    nameKh: 'មជ្ឈមណ្ឌលត្រួតពិនិត្យលក្ខណៈបច្ចេកទេសយានយន្ត ខេត្តកំពង់ស្ពឺ',
    nameEn: 'Kampong Speu Vehicle Technical Inspection Centre',
    province: 'Kampong Speu',
    address: 'Kampong Speu Province',
  },
  {
    code: 'KRT-VEHICLE-INSPECTION',
    nameKh: 'មជ្ឈមណ្ឌលត្រួតពិនិត្យលក្ខណៈបច្ចេកទេសយានយន្ត ខេត្តក្រចេះ',
    nameEn: 'Kratie Vehicle Technical Inspection Centre',
    province: 'Kratie',
    address: 'Kratie Province',
  },
  {
    code: 'RTK-VEHICLE-INSPECTION',
    nameKh: 'មជ្ឈមណ្ឌលត្រួតពិនិត្យលក្ខណៈបច្ចេកទេសយានយន្ត ខេត្តរតនគិរី',
    nameEn: 'Ratanakiri Vehicle Technical Inspection Centre',
    province: 'Ratanakiri',
    address: 'Ratanakiri Province',
  },
  {
    code: 'KCH-VEHICLE-INSPECTION',
    nameKh: 'មជ្ឈមណ្ឌលត្រួតពិនិត្យលក្ខណៈបច្ចេកទេសយានយន្ត ខេត្តកំពង់ឆ្នាំង',
    nameEn: 'Kampong Chhnang Vehicle Technical Inspection Centre',
    province: 'Kampong Chhnang',
    address: 'Kampong Chhnang Province',
  },
  {
    code: 'PVH-VEHICLE-INSPECTION',
    nameKh: 'មជ្ឈមណ្ឌលត្រួតពិនិត្យលក្ខណៈបច្ចេកទេសយានយន្ត ខេត្តព្រះវិហារ',
    nameEn: 'Preah Vihear Vehicle Technical Inspection Centre',
    province: 'Preah Vihear',
    address: 'Preah Vihear Province',
  },
  {
    code: 'KTH-VEHICLE-INSPECTION',
    nameKh: 'មជ្ឈមណ្ឌលត្រួតពិនិត្យលក្ខណៈបច្ចេកទេសយានយន្ត ខេត្តកំពង់ធំ',
    nameEn: 'Kampong Thom Vehicle Technical Inspection Centre',
    province: 'Kampong Thom',
    address: 'Kampong Thom Province',
  },
  {
    code: 'BMC-VEHICLE-INSPECTION',
    nameKh: 'មជ្ឈមណ្ឌលត្រួតពិនិត្យលក្ខណៈបច្ចេកទេសយានយន្ត ខេត្តបន្ទាយមានជ័យ',
    nameEn: 'Banteay Meanchey Vehicle Technical Inspection Centre',
    province: 'Banteay Meanchey',
    address: 'Banteay Meanchey Province',
  },
  {
    code: 'SVR-VEHICLE-INSPECTION',
    nameKh: 'មជ្ឈមណ្ឌលត្រួតពិនិត្យលក្ខណៈបច្ចេកទេសយានយន្ត ខេត្តស្វាយរៀង',
    nameEn: 'Svay Rieng Vehicle Technical Inspection Centre',
    province: 'Svay Rieng',
    address: 'Svay Rieng Province',
  },
  {
    code: 'KPT-VEHICLE-INSPECTION',
    nameKh: 'មជ្ឈមណ្ឌលត្រួតពិនិត្យលក្ខណៈបច្ចេកទេសយានយន្ត ខេត្តកំពត',
    nameEn: 'Kampot Vehicle Technical Inspection Centre',
    province: 'Kampot',
    address: 'Kampot Province',
  },
  {
    code: 'TKO-VEHICLE-INSPECTION',
    nameKh: 'មជ្ឈមណ្ឌលត្រួតពិនិត្យលក្ខណៈបច្ចេកទេសយានយន្ត ខេត្តតាកែវ',
    nameEn: 'Takeo Vehicle Technical Inspection Centre',
    province: 'Takeo',
    address: 'Takeo Province',
  },
];

const previousStationDisplayByCode: Readonly<
  Record<string, PreviousStationDisplay>
> = {
  'PP-RUSSEY-KEO': {
    code: 'DEV-PP-RUSSEY-KEO',
    nameKh: 'សាកល្បង — ទីតាំងឫស្សីកែវ',
    nameEn: 'Development Fixture — Russey Keo Technical Inspection',
    address: 'H.E. Chea Sophara Street',
  },
  'PP-NR6A': {
    code: 'DEV-PP-NR6A',
    nameKh: 'សាកល្បង — ផ្លូវជាតិលេខ ៦A',
    nameEn: 'Development Fixture — National Road 6A Technical Inspection',
    address: 'National Road 6A',
  },
  'PP-MONG-RETHY': {
    code: 'DEV-PP-MONG-RETHY',
    nameKh: 'សាកល្បង — បណ្តោយផ្លូវ ម៉ុង ឫទ្ធី (ក្បែរផ្សារបឹងបៃតង)',
    nameEn: 'Development Fixture — Mong Reththy Technical Inspection',
    address: 'Mong Reththy Road, near Boeng Baitang market',
  },
  'PP-CHAMKAR-DOUNG': {
    code: 'DEV-PP-CHAMKAR-DOUNG',
    nameKh: 'សាកល្បង — ចំការដូង',
    nameEn: 'Development Fixture — Chamkar Doung Technical Inspection',
    address: 'Chamkar Doung',
  },
  'PP-VEAL-SBOV': {
    code: 'DEV-PP-VEAL-SBOV',
    nameKh: 'សាកល្បង — វាលស្បូវផ្លូវជាតិលេខ ១',
    nameEn: 'Development Fixture — Veal Sbov Technical Inspection',
    address: 'Veal Sbov, National Road 1',
  },
  'PP-KAMBOL': {
    code: 'DEV-PP-KAMBOL',
    nameKh: 'សាកល្បង — សាខាកំបូល (ផ្លូវជាតិលេខ៤)',
    nameEn: 'Development Fixture — Kambol Technical Inspection',
    address: 'Kambol, National Road 4',
  },
};

function assertLocalDevelopmentSafety(): void {
  if (process.env.NODE_ENV !== LOCAL_SEED_ENVIRONMENT) {
    throw new Error(
      'This seed may only run with NODE_ENV=development. No database changes were made.',
    );
  }

  if (
    process.env.ALLOW_LOCAL_STATION_CAPACITY_SEED !== LOCAL_SEED_CONFIRMATION
  ) {
    throw new Error(
      'Set ALLOW_LOCAL_STATION_CAPACITY_SEED=true to explicitly allow local fixture insertion. No database changes were made.',
    );
  }
}

function dataSource(): DataSource {
  if (localDataSource === undefined) {
    throw new Error('The local seed data source has not been initialized.');
  }

  return localDataSource;
}

function loadValidatedDataSource(): DataSource {
  const sourceModule = requireFromScript('../src/database/data-source') as {
    default: DataSource;
  };

  return sourceModule.default;
}

function datePartsInPhnomPenh(now = new Date()): {
  year: number;
  month: number;
  day: number;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PHNOM_PENH_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((candidate) => candidate.type === type)?.value;
    if (value === undefined) throw new Error(`Missing ${type} date part.`);
    return Number(value);
  };

  return { year: part('year'), month: part('month'), day: part('day') };
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addCalendarDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function nextWeekdayAfter(date: Date, minimumDaysAfter: number): Date {
  let result = addCalendarDays(date, minimumDaysAfter);
  while (result.getUTCDay() === 0 || result.getUTCDay() === 6) {
    result = addCalendarDays(result, 1);
  }
  return result;
}

function createCapacityFixtures(now = new Date()): DailyCapacityFixture[] {
  const { year, month, day } = datePartsInPhnomPenh(now);
  const today = new Date(Date.UTC(year, month - 1, day));
  const firstDate = nextWeekdayAfter(today, 2);
  const secondDate = nextWeekdayAfter(firstDate, 1);
  const thirdDate = nextWeekdayAfter(secondDate, 1);
  const fourthDate = nextWeekdayAfter(thirdDate, 1);
  const fifthDate = nextWeekdayAfter(fourthDate, 1);
  const sixthDate = nextWeekdayAfter(fifthDate, 1);
  const seventhDate = nextWeekdayAfter(sixthDate, 1);

  return [
    {
      stationCode: 'PP-RUSSEY-KEO',
      capacityDate: formatDate(firstDate),
      dailyCapacity: 20,
      reservedCount: 4,
      isClosed: false,
    },
    {
      stationCode: 'PP-RUSSEY-KEO',
      capacityDate: formatDate(secondDate),
      dailyCapacity: 20,
      reservedCount: 12,
      isClosed: false,
    },
    {
      stationCode: 'PP-RUSSEY-KEO',
      capacityDate: formatDate(thirdDate),
      dailyCapacity: 20,
      reservedCount: 20,
      isClosed: false,
    },
    {
      stationCode: 'PP-RUSSEY-KEO',
      capacityDate: formatDate(fourthDate),
      dailyCapacity: 20,
      reservedCount: 0,
      isClosed: true,
    },
    {
      stationCode: 'PP-RUSSEY-KEO',
      capacityDate: formatDate(fifthDate),
      dailyCapacity: 30,
      reservedCount: 7,
      isClosed: false,
    },
    {
      stationCode: 'PP-NR6A',
      capacityDate: formatDate(firstDate),
      dailyCapacity: 10,
      reservedCount: 2,
      isClosed: false,
    },
    {
      stationCode: 'PP-NR6A',
      capacityDate: formatDate(secondDate),
      dailyCapacity: 10,
      reservedCount: 8,
      isClosed: false,
    },
    {
      stationCode: 'PP-NR6A',
      capacityDate: formatDate(sixthDate),
      dailyCapacity: 12,
      reservedCount: 0,
      isClosed: false,
    },
    {
      stationCode: 'PP-MONG-RETHY',
      capacityDate: formatDate(thirdDate),
      dailyCapacity: 16,
      reservedCount: 1,
      isClosed: false,
    },
    {
      stationCode: 'PP-CHAMKAR-DOUNG',
      capacityDate: formatDate(fourthDate),
      dailyCapacity: 14,
      reservedCount: 5,
      isClosed: false,
    },
    {
      stationCode: 'PP-VEAL-SBOV',
      capacityDate: formatDate(sixthDate),
      dailyCapacity: 12,
      reservedCount: 0,
      isClosed: false,
    },
    {
      stationCode: 'PP-KAMBOL',
      capacityDate: formatDate(seventhDate),
      dailyCapacity: 25,
      reservedCount: 24,
      isClosed: false,
    },
  ];
}

function stationMatches(
  existing: InspectionStation,
  fixture: StationFixture,
): boolean {
  return (
    existing.nameKh === fixture.nameKh &&
    existing.nameEn === fixture.nameEn &&
    existing.province === fixture.province &&
    existing.address === fixture.address &&
    existing.phone === null &&
    existing.isActive
  );
}

function matchesPreviousDevelopmentDisplay(
  existing: InspectionStation,
  fixture: StationFixture,
  expectedCode: string,
): boolean {
  const previous = previousStationDisplayByCode[fixture.code];
  if (previous === undefined) return false;

  return (
    existing.code === expectedCode &&
    existing.nameKh === previous.nameKh &&
    existing.nameEn === previous.nameEn &&
    existing.province === fixture.province &&
    existing.address === previous.address &&
    existing.phone === null &&
    existing.isActive
  );
}

function matchesKnownFixture(
  existing: InspectionStation,
  fixture: StationFixture,
  expectedCode: string,
): boolean {
  return (
    existing.code === expectedCode &&
    (stationMatches(existing, fixture) ||
      matchesPreviousDevelopmentDisplay(existing, fixture, expectedCode))
  );
}

function capacityMatches(
  existing: InspectionStationDailyCapacity,
  fixture: DailyCapacityFixture,
): boolean {
  return (
    existing.dailyCapacity === fixture.dailyCapacity &&
    existing.reservedCount === fixture.reservedCount &&
    existing.isClosed === fixture.isClosed
  );
}

export async function seedFixtures(
  source: DataSource = dataSource(),
  options: SeedOptions = {},
): Promise<SeedResult> {
  const capacities =
    options.includeCapacities === false ? [] : createCapacityFixtures();
  return source.transaction(async (manager) => {
    const result: SeedResult = {
      stationsCreated: [],
      stationsSkipped: [],
      stationsUpdated: [],
      capacitiesCreated: [],
      capacitiesSkipped: [],
    };
    const stations = manager.getRepository(InspectionStation);
    const dailyCapacities = manager.getRepository(
      InspectionStationDailyCapacity,
    );
    const stationIds = new Map<string, string>();
    const legacyCodeMigrations = new Set<string>();

    for (const fixture of stationFixtures) {
      const previousFixture = previousStationDisplayByCode[fixture.code];
      const existing = await stations.findOneBy({ code: fixture.code });
      const legacyExisting =
        previousFixture === undefined
          ? null
          : await stations.findOneBy({ code: previousFixture.code });

      if (existing !== null && legacyExisting !== null) {
        throw new Error(
          `${fixture.code} and legacy ${previousFixture.code} both exist. Neither row was modified.`,
        );
      }

      if (existing !== null) {
        if (!matchesKnownFixture(existing, fixture, fixture.code)) {
          throw new Error(
            `${fixture.code} exists but does not match the expected development fixture. It was not modified.`,
          );
        }

        stationIds.set(fixture.code, existing.id);
        result.stationsSkipped.push(fixture.code);
        continue;
      }

      if (legacyExisting !== null) {
        if (
          !matchesKnownFixture(legacyExisting, fixture, previousFixture.code)
        ) {
          throw new Error(
            `${previousFixture.code} exists but does not match the expected legacy development fixture. It was not modified.`,
          );
        }

        await stations.save(
          stations.merge(legacyExisting, { code: fixture.code }),
        );
        stationIds.set(fixture.code, legacyExisting.id);
        legacyCodeMigrations.add(fixture.code);
        result.stationsUpdated.push(fixture.code);
        continue;
      }

      const created = await stations.save(
        stations.create({ ...fixture, phone: null, isActive: true }),
      );
      stationIds.set(fixture.code, created.id);
      result.stationsCreated.push(fixture.code);
    }

    for (const fixture of capacities) {
      const identity = `${fixture.stationCode} ${fixture.capacityDate}`;
      if (legacyCodeMigrations.has(fixture.stationCode)) {
        result.capacitiesSkipped.push(identity);
        continue;
      }

      const stationId = stationIds.get(fixture.stationCode);
      if (stationId === undefined) {
        throw new Error(
          `Fixture station ${fixture.stationCode} was not found.`,
        );
      }

      const existing = await dailyCapacities.findOneBy({
        stationId,
        capacityDate: fixture.capacityDate,
      });
      if (existing !== null) {
        if (!capacityMatches(existing, fixture)) {
          throw new Error(
            `${identity} capacity exists but does not match the expected development fixture. It was not modified.`,
          );
        }

        result.capacitiesSkipped.push(identity);
        continue;
      }

      await dailyCapacities.save(
        dailyCapacities.create({
          stationId,
          capacityDate: fixture.capacityDate,
          dailyCapacity: fixture.dailyCapacity,
          reservedCount: fixture.reservedCount,
          isClosed: fixture.isClosed,
        }),
      );
      result.capacitiesCreated.push(identity);
    }

    return result;
  });
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function databaseNameFromQuery(value: unknown): string {
  if (!isUnknownArray(value) || value.length === 0) return 'unknown';
  const firstRow = value[0];
  if (typeof firstRow !== 'object' || firstRow === null) return 'unknown';

  const candidate = firstRow as { database_name?: unknown };
  return typeof candidate.database_name === 'string'
    ? candidate.database_name
    : 'unknown';
}

async function main(): Promise<void> {
  assertLocalDevelopmentSafety();
  localDataSource = loadValidatedDataSource();
  await dataSource().initialize();

  try {
    const databaseName = databaseNameFromQuery(
      await dataSource().query('SELECT current_database() AS database_name'),
    );
    console.log(`Database: ${databaseName}`);
    console.log(`Configured host: ${process.env.DB_HOST ?? 'unknown'}`);
    console.log(
      'About to insert local development inspection-station and capacity fixtures.',
    );

    const result = await seedFixtures();
    result.stationsCreated.forEach((code) => console.log(`CREATED ${code}`));
    result.stationsSkipped.forEach((code) => console.log(`SKIPPED ${code}`));
    result.stationsUpdated.forEach((code) => console.log(`UPDATED ${code}`));
    result.capacitiesCreated.forEach((identity) =>
      console.log(`CREATED capacity ${identity}`),
    );
    result.capacitiesSkipped.forEach((identity) =>
      console.log(`SKIPPED capacity ${identity}`),
    );
    console.log(`Stations created: ${result.stationsCreated.length}`);
    console.log(`Stations skipped: ${result.stationsSkipped.length}`);
    console.log(`Stations updated: ${result.stationsUpdated.length}`);
    console.log(`Capacities created: ${result.capacitiesCreated.length}`);
    console.log(`Capacities skipped: ${result.capacitiesSkipped.length}`);
  } finally {
    await dataSource().destroy();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown error.';
    console.error(`Local inspection-station seed aborted: ${message}`);
    process.exitCode = 1;
  });
}
