import 'dotenv/config';

import { createRequire } from 'node:module';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import type { DataSource, EntityManager } from 'typeorm';

import { normalizeEmail } from '../src/auth/identifier-normalization';
import { User } from '../src/users/entities/user.entity';
import { UserRole } from '../src/users/enums/user-role.enum';
import { UserStatus } from '../src/users/enums/user-status.enum';
import {
  LEGACY_LOCAL_DEMO_REGISTRATIONS,
  LOCAL_DEMO_REGISTRATIONS,
} from './local-demo-vehicle-fixtures';

const requireFromScript = createRequire(__filename);
const RESET_ENVIRONMENT = 'development';
const RESET_CONFIRMATION = 'true';

let localDataSource: DataSource | undefined;

interface BackupData {
  createdAt: string;
  database: string;
  vehicles: unknown[];
  applications: unknown[];
  documents: unknown[];
  applicationStatusHistory: unknown[];
  payments: unknown[];
  paymentStatusHistory: unknown[];
  appointments: unknown[];
  capacities: unknown[];
  inspections: unknown[];
  stickers: unknown[];
  auditLogs: unknown[];
  timelineEvents: unknown[];
  notifications: unknown[];
}

interface ResetResult {
  backupDirectory: string;
  deleted: Record<string, number>;
  removedFiles: string[];
  missingFiles: string[];
}

function dataSource(): DataSource {
  if (localDataSource === undefined)
    throw new Error('The local reset data source has not been initialized.');
  return localDataSource;
}

function readCitizenSelector(): { email?: string; id?: string } {
  const id = process.argv
    .slice(2)
    .find((argument) => argument.startsWith('--citizen-id='))
    ?.slice('--citizen-id='.length)
    .trim();
  const email = process.argv
    .slice(2)
    .find((argument) => argument.startsWith('--citizen-email='))
    ?.slice('--citizen-email='.length)
    .trim();
  if (id !== undefined && id !== '') return { id };
  if (email !== undefined && email !== '') return { email };
  throw new Error(
    'Missing required selector: --citizen-id=<uuid> or --citizen-email=<email>.',
  );
}

function assertSafety(): void {
  if (process.env.NODE_ENV !== RESET_ENVIRONMENT)
    throw new Error(
      'This reset may only run with NODE_ENV=development. No database changes were made.',
    );
  if (process.env.ALLOW_LOCAL_DEMO_WORKFLOW_RESET !== RESET_CONFIRMATION)
    throw new Error(
      'Set ALLOW_LOCAL_DEMO_WORKFLOW_RESET=true to explicitly allow local workflow cleanup. No database changes were made.',
    );
}

async function resolveCitizenId(
  manager: EntityManager,
  selector: { email?: string; id?: string },
): Promise<string> {
  const users = await manager.getRepository(User).find({
    where:
      selector.id === undefined
        ? { email: normalizeEmail(selector.email as string) }
        : { id: selector.id },
    select: { id: true, role: true, status: true },
  });
  const user = users[0];
  if (
    users.length !== 1 ||
    user === undefined ||
    user.role !== UserRole.CITIZEN ||
    user.status !== UserStatus.ACTIVE
  )
    throw new Error('Expected one ACTIVE primary citizen.');
  return user.id;
}

async function fixtureVehicleRows(
  manager: EntityManager,
  citizenId: string,
): Promise<Array<{ id: string }>> {
  return manager.query<Array<{ id: string }>>(
    `SELECT "id" FROM "vehicles"
      WHERE "linked_citizen_id" = $1 AND "registration_number" = ANY($2::text[])`,
    [
      citizenId,
      [...LEGACY_LOCAL_DEMO_REGISTRATIONS, ...LOCAL_DEMO_REGISTRATIONS],
    ],
  );
}

async function rowsForBackup(
  manager: EntityManager,
  vehicleIds: string[],
): Promise<BackupData> {
  const query = <T>(text: string, values: unknown[] = []) =>
    manager.query<T[]>(text, values);
  const applications = await query<{ id: string }>(
    `SELECT * FROM "renewal_applications" WHERE "vehicle_id" = ANY($1::uuid[])`,
    [vehicleIds],
  );
  const applicationIds = applications.map(({ id }) => id);
  const payments =
    applicationIds.length === 0
      ? []
      : await query<{ id: string }>(
          `SELECT * FROM "payments" WHERE "application_id" = ANY($1::uuid[])`,
          [applicationIds],
        );
  const paymentIds = payments.map(({ id }) => id);
  const appointments =
    applicationIds.length === 0
      ? []
      : await query<{ daily_capacity_id: string | null }>(
          `SELECT * FROM "appointments" WHERE "application_id" = ANY($1::uuid[])`,
          [applicationIds],
        );
  const capacityIds = appointments.flatMap(({ daily_capacity_id }) =>
    daily_capacity_id === null ? [] : [daily_capacity_id],
  );
  const database = await query<{ name: string }>(
    'SELECT current_database() AS name',
  );
  return {
    createdAt: new Date().toISOString(),
    database: database[0]?.name ?? 'unknown',
    vehicles:
      vehicleIds.length === 0
        ? []
        : await query('SELECT * FROM "vehicles" WHERE "id" = ANY($1::uuid[])', [
            vehicleIds,
          ]),
    applications,
    documents:
      applicationIds.length === 0
        ? []
        : await query(
            'SELECT * FROM "application_documents" WHERE "application_id" = ANY($1::uuid[])',
            [applicationIds],
          ),
    applicationStatusHistory:
      applicationIds.length === 0
        ? []
        : await query(
            'SELECT * FROM "renewal_application_status_history" WHERE "application_id" = ANY($1::uuid[])',
            [applicationIds],
          ),
    payments,
    paymentStatusHistory:
      paymentIds.length === 0
        ? []
        : await query(
            'SELECT * FROM "payment_status_history" WHERE "payment_id" = ANY($1::uuid[])',
            [paymentIds],
          ),
    appointments,
    capacities:
      capacityIds.length === 0
        ? []
        : await query(
            'SELECT * FROM "inspection_station_daily_capacities" WHERE "id" = ANY($1::uuid[])',
            [capacityIds],
          ),
    inspections:
      applicationIds.length === 0
        ? []
        : await query(
            'SELECT * FROM "inspections" WHERE "application_id" = ANY($1::uuid[])',
            [applicationIds],
          ),
    stickers:
      applicationIds.length === 0
        ? []
        : await query(
            'SELECT * FROM "stickers" WHERE "application_id" = ANY($1::uuid[])',
            [applicationIds],
          ),
    auditLogs:
      applicationIds.length === 0
        ? []
        : await query(
            'SELECT * FROM "audit_logs" WHERE "application_id" = ANY($1::uuid[])',
            [applicationIds],
          ),
    timelineEvents:
      applicationIds.length === 0
        ? []
        : await query(
            'SELECT * FROM "application_timeline_events" WHERE "application_id" = ANY($1::uuid[])',
            [applicationIds],
          ),
    notifications:
      applicationIds.length === 0
        ? []
        : await query(
            'SELECT * FROM "notifications" WHERE "application_id" = ANY($1::uuid[])',
            [applicationIds],
          ),
  };
}

function storageKeys(backup: BackupData): string[] {
  const fromDocuments = backup.documents.flatMap((row) => {
    const key = (row as { storage_key?: unknown }).storage_key;
    return typeof key === 'string' ? [key] : [];
  });
  const fromPayments = backup.payments.flatMap((row) => {
    const payment = row as {
      invoice_file_key?: unknown;
      receipt_file_key?: unknown;
      inspection_sheet_file_key?: unknown;
    };
    return [
      payment.invoice_file_key,
      payment.receipt_file_key,
      payment.inspection_sheet_file_key,
    ].flatMap((key) => (typeof key === 'string' ? [key] : []));
  });
  return [...new Set([...fromDocuments, ...fromPayments])];
}

function storagePath(storageRoot: string, storageKey: string): string {
  const target = resolve(storageRoot, ...storageKey.split('/'));
  if (basename(target) !== storageKey.split('/').at(-1))
    throw new Error('Unsafe storage key in local reset backup.');
  return target;
}

async function createBackup(
  manager: EntityManager,
  citizenId: string,
): Promise<{ directory: string; backup: BackupData; keys: string[] }> {
  const vehicles = await fixtureVehicleRows(manager, citizenId);
  const backup = await rowsForBackup(
    manager,
    vehicles.map(({ id }) => id),
  );
  const stamp = new Date()
    .toISOString()
    .replaceAll(':', '-')
    .replaceAll('.', '-');
  const directory = resolve(
    process.cwd(),
    'storage',
    'local-demo-backups',
    stamp,
  );
  const filesDirectory = resolve(directory, 'private-files');
  await mkdir(filesDirectory, { recursive: true });
  await writeFile(
    resolve(directory, 'affected-rows.json'),
    JSON.stringify(backup, null, 2),
    { encoding: 'utf8', flag: 'wx' },
  );
  const storageRoot = resolve(
    process.cwd(),
    process.env.PRIVATE_STORAGE_ROOT ?? 'storage/private',
  );
  const keys = storageKeys(backup);
  for (const key of keys) {
    const source = storagePath(storageRoot, key);
    const target = resolve(filesDirectory, ...key.split('/'));
    await mkdir(resolve(target, '..'), { recursive: true });
    try {
      await copyFile(source, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return { directory, backup, keys };
}

async function deleteRows(
  manager: EntityManager,
  applicationIds: string[],
  paymentIds: string[],
): Promise<Record<string, number>> {
  const deleted: Record<string, number> = {};
  const remove = async (
    name: string,
    table: string,
    where: string,
    values: unknown[],
  ) => {
    const result = await manager.query<Array<{ id: string }>>(
      `DELETE FROM ${table} WHERE ${where} RETURNING "id"`,
      values,
    );
    const rows =
      Array.isArray(result[0]) && typeof result[1] === 'number'
        ? result[0]
        : result;
    deleted[name] = rows.length;
  };
  if (applicationIds.length === 0) return deleted;
  await remove('stickers', '"stickers"', '"application_id" = ANY($1::uuid[])', [
    applicationIds,
  ]);
  await manager.query(
    'ALTER TABLE "inspections" DISABLE TRIGGER "trg_guard_completed_inspection_immutable"',
  );
  try {
    await remove(
      'inspections',
      '"inspections"',
      '"application_id" = ANY($1::uuid[])',
      [applicationIds],
    );
  } finally {
    await manager.query(
      'ALTER TABLE "inspections" ENABLE TRIGGER "trg_guard_completed_inspection_immutable"',
    );
  }
  await remove(
    'appointments',
    '"appointments"',
    '"application_id" = ANY($1::uuid[])',
    [applicationIds],
  );
  await remove(
    'paymentStatusHistory',
    '"payment_status_history"',
    '"payment_id" = ANY($1::uuid[])',
    [paymentIds],
  );
  await remove('payments', '"payments"', '"application_id" = ANY($1::uuid[])', [
    applicationIds,
  ]);
  await remove(
    'documents',
    '"application_documents"',
    '"application_id" = ANY($1::uuid[])',
    [applicationIds],
  );
  await manager.query(
    'ALTER TABLE "renewal_application_status_history" DISABLE TRIGGER "trg_guard_renewal_application_status_history_immutable"',
  );
  try {
    await remove(
      'applicationStatusHistory',
      '"renewal_application_status_history"',
      '"application_id" = ANY($1::uuid[])',
      [applicationIds],
    );
  } finally {
    await manager.query(
      'ALTER TABLE "renewal_application_status_history" ENABLE TRIGGER "trg_guard_renewal_application_status_history_immutable"',
    );
  }
  await remove(
    'auditLogs',
    '"audit_logs"',
    '"application_id" = ANY($1::uuid[])',
    [applicationIds],
  );
  await remove(
    'timelineEvents',
    '"application_timeline_events"',
    '"application_id" = ANY($1::uuid[])',
    [applicationIds],
  );
  await remove(
    'notifications',
    '"notifications"',
    '"application_id" = ANY($1::uuid[])',
    [applicationIds],
  );
  await remove(
    'applications',
    '"renewal_applications"',
    '"id" = ANY($1::uuid[])',
    [applicationIds],
  );
  return deleted;
}

async function reset(): Promise<ResetResult> {
  const citizenId = await dataSource().transaction((manager) =>
    resolveCitizenId(manager, readCitizenSelector()),
  );
  const backup = await dataSource().transaction((manager) =>
    createBackup(manager, citizenId),
  );
  const deleted = await dataSource().transaction(async (manager) => {
    const applications = backup.backup.applications as Array<{ id: string }>;
    const payments = backup.backup.payments as Array<{ id: string }>;
    return deleteRows(
      manager,
      applications.map(({ id }) => id),
      payments.map(({ id }) => id),
    );
  });
  const storageRoot = resolve(
    process.cwd(),
    process.env.PRIVATE_STORAGE_ROOT ?? 'storage/private',
  );
  const removedFiles: string[] = [];
  const missingFiles: string[] = [];
  for (const key of backup.keys) {
    try {
      const { unlink } = await import('node:fs/promises');
      await unlink(storagePath(storageRoot, key));
      removedFiles.push(key);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        missingFiles.push(key);
      else throw error;
    }
  }
  return {
    backupDirectory: backup.directory,
    deleted,
    removedFiles,
    missingFiles,
  };
}

async function main(): Promise<void> {
  assertSafety();
  readCitizenSelector();
  localDataSource = (
    requireFromScript('../src/database/data-source') as { default: DataSource }
  ).default;
  await dataSource().initialize();
  try {
    console.log(JSON.stringify(await reset(), null, 2));
  } finally {
    await dataSource().destroy();
  }
}

void main().catch((error: unknown) => {
  console.error(
    `Local demo workflow reset aborted: ${error instanceof Error ? error.message : 'Unknown error.'}`,
  );
  process.exitCode = 1;
});
