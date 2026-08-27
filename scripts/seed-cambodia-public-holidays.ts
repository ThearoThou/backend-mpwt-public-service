import { createRequire } from 'node:module';
import type { DataSource, EntityManager } from 'typeorm';

import {
  CAMBODIA_PUBLIC_HOLIDAYS_2026,
  CAMBODIA_PUBLIC_HOLIDAYS_2026_COUNT,
} from './cambodia-public-holiday-fixtures';
import { InspectionServiceClosure } from '../src/scheduling/entities/inspection-service-closure.entity';

const requireFromScript = createRequire(__filename);

interface SeedResult {
  created: number;
  updated: number;
  unchanged: number;
}

interface SeedVerification {
  count: number;
  earliest: string;
  latest: string;
  allActive: boolean;
}

function loadValidatedDataSource(): DataSource {
  const sourceModule = requireFromScript('../src/database/data-source') as {
    default: DataSource;
  };
  return sourceModule.default;
}

function officialFixtureMatches(
  closure: InspectionServiceClosure,
  fixture: (typeof CAMBODIA_PUBLIC_HOLIDAYS_2026)[number],
): boolean {
  return (
    closure.reasonKh === fixture.reasonKh &&
    closure.reasonEn === fixture.reasonEn &&
    closure.isActive
  );
}

export async function seedCambodiaPublicHolidays(
  dataSource: DataSource,
): Promise<SeedResult> {
  return dataSource.transaction(async (manager: EntityManager) => {
    const closures = manager.getRepository(InspectionServiceClosure);
    const result: SeedResult = { created: 0, updated: 0, unchanged: 0 };

    for (const fixture of CAMBODIA_PUBLIC_HOLIDAYS_2026) {
      const existing = await closures.findOneBy({
        closureDate: fixture.closureDate,
      });

      if (existing === null) {
        await closures.save(closures.create({ ...fixture, isActive: true }));
        result.created++;
        continue;
      }

      if (officialFixtureMatches(existing, fixture)) {
        result.unchanged++;
        continue;
      }

      await closures.save(
        closures.merge(existing, { ...fixture, isActive: true }),
      );
      result.updated++;
    }

    return result;
  });
}

export async function verifyCambodiaPublicHolidays2026(
  dataSource: DataSource,
): Promise<SeedVerification> {
  const rows = await dataSource.getRepository(InspectionServiceClosure).find({
    where: CAMBODIA_PUBLIC_HOLIDAYS_2026.map(({ closureDate }) => ({
      closureDate,
    })),
    order: { closureDate: 'ASC' },
  });
  const dates = rows.map(({ closureDate }) => closureDate);
  const uniqueDates = new Set(dates);

  if (
    rows.length !== CAMBODIA_PUBLIC_HOLIDAYS_2026_COUNT ||
    uniqueDates.size !== CAMBODIA_PUBLIC_HOLIDAYS_2026_COUNT ||
    dates[0] !== '2026-01-01' ||
    dates.at(-1) !== '2026-12-29' ||
    !rows.every(({ isActive }) => isActive)
  ) {
    throw new Error(
      'Official Cambodian 2026 public-holiday verification failed after seeding.',
    );
  }

  return {
    count: rows.length,
    earliest: dates[0],
    latest: dates.at(-1) as string,
    allActive: true,
  };
}

async function main(): Promise<void> {
  const dataSource = loadValidatedDataSource();
  await dataSource.initialize();

  try {
    const result = await seedCambodiaPublicHolidays(dataSource);
    const verification = await verifyCambodiaPublicHolidays2026(dataSource);
    console.log(`Official Cambodian 2026 holidays created: ${result.created}`);
    console.log(`Official Cambodian 2026 holidays updated: ${result.updated}`);
    console.log(
      `Official Cambodian 2026 holidays unchanged: ${result.unchanged}`,
    );
    console.log(
      `Verified ${verification.count} active dates: ${verification.earliest} through ${verification.latest}`,
    );
  } finally {
    await dataSource.destroy();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error.';
  console.error(`Cambodian public-holiday seed aborted: ${message}`);
  process.exitCode = 1;
});
