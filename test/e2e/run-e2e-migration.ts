import {
  e2eDataSource,
  initializeApprovedE2eDataSource,
} from './e2e-data-source';

async function run(): Promise<void> {
  const direction = process.argv[2];
  await initializeApprovedE2eDataSource();

  try {
    if (direction === 'up') {
      await e2eDataSource.runMigrations();
      return;
    }

    if (direction === 'down') {
      await e2eDataSource.undoLastMigration();
      return;
    }

    throw new Error('E2E migration direction must be either up or down.');
  } finally {
    if (e2eDataSource.isInitialized) {
      await e2eDataSource.destroy();
    }
  }
}

void run();
