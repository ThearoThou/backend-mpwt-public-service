import 'dotenv/config';

import { mkdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { relative, resolve, sep } from 'node:path';
import type { DataSource } from 'typeorm';
import { seedRealisticDevelopmentDataset } from './seed-realistic-development';

const EXPECTED_NODE_ENV = 'development';
const EXPECTED_DB_NAME = 'mpwt_vehicle_inspection_renewal';
const EXPECTED_STORAGE_ROOT = 'storage/private';
const RESET_CONFIRMATION = 'true';
const requireFromScript = createRequire(__filename);

let localDataSource: DataSource | undefined;

interface ResetTarget {
  databaseHost: string;
  databaseName: string;
  storageRoot: string;
}

function dataSource(): DataSource {
  if (localDataSource === undefined) {
    throw new Error('The local reset data source has not been initialized.');
  }

  return localDataSource;
}

function assertLocalResetTarget(): ResetTarget {
  if (process.env.NODE_ENV !== EXPECTED_NODE_ENV) {
    throw new Error(
      'Reset requires NODE_ENV=development. No data was removed.',
    );
  }

  if (process.env.ALLOW_REALISTIC_DEVELOPMENT_RESET !== RESET_CONFIRMATION) {
    throw new Error(
      'Set ALLOW_REALISTIC_DEVELOPMENT_RESET=true to explicitly allow the canonical development reset. No data was removed.',
    );
  }

  const databaseHost = process.env.DB_HOST?.trim().toLowerCase();
  if (databaseHost !== 'localhost' && databaseHost !== '127.0.0.1') {
    throw new Error(
      'Reset is limited to DB_HOST=localhost or 127.0.0.1. No data was removed.',
    );
  }

  const databaseName = process.env.DB_NAME?.trim();
  if (databaseName !== EXPECTED_DB_NAME) {
    throw new Error(
      `Reset is limited to the ${EXPECTED_DB_NAME} local database. No data was removed.`,
    );
  }

  const configuredStorageRoot =
    process.env.PRIVATE_STORAGE_ROOT?.trim() || EXPECTED_STORAGE_ROOT;
  const storageBase = resolve(process.cwd(), 'storage');
  const storageRoot = resolve(process.cwd(), configuredStorageRoot);
  const expectedStorageRoot = resolve(process.cwd(), EXPECTED_STORAGE_ROOT);
  const relativeToStorage = relative(storageBase, storageRoot);

  if (
    storageRoot !== expectedStorageRoot ||
    relativeToStorage === '' ||
    relativeToStorage === '..' ||
    relativeToStorage.startsWith(`..${sep}`)
  ) {
    throw new Error(
      `Reset is limited to ${EXPECTED_STORAGE_ROOT} inside this project. No files were removed.`,
    );
  }

  return { databaseHost, databaseName, storageRoot };
}

function loadValidatedDataSource(): DataSource {
  return (
    requireFromScript('../src/database/data-source') as { default: DataSource }
  ).default;
}

async function main(): Promise<void> {
  const target = assertLocalResetTarget();
  localDataSource = loadValidatedDataSource();
  await dataSource().initialize();

  try {
    const migrations = await dataSource().runMigrations();

    await dataSource().transaction(async (manager) => {
      await manager.query(
        'ALTER TABLE "inspections" DISABLE TRIGGER "trg_guard_completed_inspection_immutable"',
      );
      await manager.query(
        'ALTER TABLE "renewal_application_status_history" DISABLE TRIGGER "trg_guard_renewal_application_status_history_immutable"',
      );
      try {
        for (const table of [
          'technical_inspection_certificates',
          'stickers',
          'inspections',
          'payment_status_history',
          'payments',
          'application_documents',
          'appointments',
          'renewal_application_status_history',
          'application_timeline_events',
          'notifications',
          'audit_logs',
          'vehicle_classification_history',
          'renewal_applications',
          'vehicles',
          'appointment_slots',
          'inspection_station_daily_capacities',
          'verification_codes',
          'password_reset_authorizations',
          'refresh_sessions',
          'citizen_profiles',
          'users',
        ]) {
          await manager.query(`DELETE FROM "${table}"`);
        }
        await manager.query(
          `DELETE FROM "inspection_vehicle_categories" WHERE "code" IN ('LOCAL-DEMO-LIGHT', 'LOCAL-DEMO-HEAVY')`,
        );
      } finally {
        await manager.query(
          'ALTER TABLE "renewal_application_status_history" ENABLE TRIGGER "trg_guard_renewal_application_status_history_immutable"',
        );
        await manager.query(
          'ALTER TABLE "inspections" ENABLE TRIGGER "trg_guard_completed_inspection_immutable"',
        );
      }
    });

    await rm(target.storageRoot, { recursive: true, force: true });
    await mkdir(target.storageRoot, { recursive: true });
    const seedCounts = await seedRealisticDevelopmentDataset(dataSource());

    if (await dataSource().showMigrations()) {
      throw new Error('Local reset left pending migrations.');
    }

    console.log(
      JSON.stringify(
        {
          databaseHost: target.databaseHost,
          databaseName: target.databaseName,
          storageRoot: target.storageRoot,
          migrationsApplied: migrations.map((migration) => migration.name),
          storageRecreated: true,
          seedCounts,
        },
        null,
        2,
      ),
    );
  } finally {
    await dataSource().destroy();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error.';
  console.error(`Local development reset aborted: ${message}`);
  process.exitCode = 1;
});
