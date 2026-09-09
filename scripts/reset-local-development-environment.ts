import 'dotenv/config';

import { mkdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { relative, resolve, sep } from 'node:path';
import type { DataSource } from 'typeorm';

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

  if (process.env.ALLOW_LOCAL_DEMO_RESET !== RESET_CONFIRMATION) {
    throw new Error(
      'Set ALLOW_LOCAL_DEMO_RESET=true to explicitly allow the local development reset. No data was removed.',
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
    await dataSource().query('DROP SCHEMA IF EXISTS "public" CASCADE');
    await dataSource().query('CREATE SCHEMA "public"');
    await dataSource().query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    const migrations = await dataSource().runMigrations();

    await rm(target.storageRoot, { recursive: true, force: true });
    await mkdir(target.storageRoot, { recursive: true });

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
