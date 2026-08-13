import { DataSource } from 'typeorm';

import { createDatabaseOptions } from '../../src/database/database.options';
import { installE2eEnvironment } from './e2e-environment';
import { assertApprovedE2eDatabase } from './e2e-safety';

export const e2eEnvironment = installE2eEnvironment();

export const e2eDataSource = new DataSource(
  createDatabaseOptions(e2eEnvironment),
);

export async function initializeApprovedE2eDataSource(): Promise<DataSource> {
  if (!e2eDataSource.isInitialized) {
    await e2eDataSource.initialize();
  }

  await assertApprovedE2eDatabase(e2eDataSource, e2eEnvironment);
  return e2eDataSource;
}
