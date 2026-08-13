import {
  e2eDataSource,
  initializeApprovedE2eDataSource,
} from './e2e-data-source';

export default async function e2eGlobalSetup(): Promise<void> {
  await initializeApprovedE2eDataSource();
  await e2eDataSource.destroy();
}
