import { promises as fs } from 'node:fs';
import { relative, resolve } from 'node:path';
import type { DataSource, EntityManager } from 'typeorm';

import type { EnvironmentVariables } from '../../src/config/environment.validation';

export const E2E_DATABASE_NAME = 'mpwt_vehicle_inspection_renewal_e2e';
export const E2E_PRIVATE_STORAGE_ROOT = 'storage/e2e-private';

type E2eDatabaseEnvironment = Pick<EnvironmentVariables, 'DB_NAME'>;

export function assertApprovedE2eDatabaseConfiguration(
  environment: E2eDatabaseEnvironment,
): void {
  if (environment.DB_NAME !== E2E_DATABASE_NAME) {
    throw new Error(
      `E2E database operations are restricted to ${E2E_DATABASE_NAME}; received ${environment.DB_NAME}.`,
    );
  }
}

export async function assertApprovedE2eDatabase(
  dataSource: DataSource,
  environment: E2eDatabaseEnvironment,
): Promise<void> {
  assertApprovedE2eDatabaseConfiguration(environment);

  const [result] = await dataSource.query<Array<{ currentDatabase: string }>>(
    'SELECT current_database() AS "currentDatabase"',
  );

  if (result?.currentDatabase !== E2E_DATABASE_NAME) {
    throw new Error(
      `E2E database operations are restricted to ${E2E_DATABASE_NAME}; connected to ${result?.currentDatabase ?? 'an unknown database'}.`,
    );
  }
}

export async function cleanApprovedE2eFixtures(
  dataSource: DataSource,
  environment: E2eDatabaseEnvironment,
  cleanup: (manager: EntityManager) => Promise<void>,
): Promise<void> {
  await assertApprovedE2eDatabase(dataSource, environment);
  await dataSource.transaction(cleanup);
}

export async function truncateApprovedE2eData(
  dataSource: DataSource,
  environment: E2eDatabaseEnvironment,
): Promise<void> {
  await assertApprovedE2eDatabase(dataSource, environment);
  await dataSource.query(`
    TRUNCATE TABLE
      "payment_status_history", "payments", "appointments",
      "inspection_station_daily_capacities", "inspection_stations",
      "renewal_application_status_history", "renewal_applications",
      "vehicles", "inspection_vehicle_categories", "refresh_sessions", "users"
    RESTART IDENTITY CASCADE
  `);
}

export function approvedE2eStorageRoot(storageRoot: string): string {
  const workspaceRoot = resolve(process.cwd());
  const approvedRoot = resolve(workspaceRoot, E2E_PRIVATE_STORAGE_ROOT);
  const requestedRoot = resolve(workspaceRoot, storageRoot);
  const workspaceRelative = relative(workspaceRoot, requestedRoot);

  if (
    requestedRoot !== approvedRoot ||
    workspaceRelative === '' ||
    workspaceRelative === '..' ||
    workspaceRelative.startsWith(`..\\`) ||
    workspaceRelative.startsWith('../')
  ) {
    throw new Error(
      `E2E storage cleanup is restricted to ${E2E_PRIVATE_STORAGE_ROOT}.`,
    );
  }

  return approvedRoot;
}

export async function cleanApprovedE2eStorage(
  storageRoot: string,
): Promise<void> {
  const approvedRoot = approvedE2eStorageRoot(storageRoot);
  await fs.rm(approvedRoot, { recursive: true, force: true });
  await fs.mkdir(approvedRoot, { recursive: true });
}
