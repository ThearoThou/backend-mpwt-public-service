import 'dotenv/config';

import { createRequire } from 'node:module';
import { isAbsolute, relative, resolve } from 'node:path';
import { unlink } from 'node:fs/promises';
import type { DataSource, EntityManager } from 'typeorm';

import { RenewalApplication } from '../src/applications/entities/renewal-application.entity';
import { ApplicationStatus } from '../src/applications/enums/application-status.enum';
import { Payment } from '../src/payments/entities/payment.entity';
import { PaymentStatusHistory } from '../src/payments/entities/payment-status-history.entity';
import { PaymentMethod } from '../src/payments/enums/payment-method.enum';
import { PaymentStatus } from '../src/payments/enums/payment-status.enum';

const requireFromScript = createRequire(__filename);
const RESET_ENVIRONMENTS = new Set(['development', 'test']);
const RESET_CONFIRMATION = 'true';

let localDataSource: DataSource | undefined;

interface ResetInput {
  applicationId: string;
  execute: boolean;
}

interface ResetResult {
  applicationId: string;
  applicationStatus: ApplicationStatus;
  paymentId: string;
  oldInvoiceNumber: string;
  removedPaymentStatusHistoryRows: number;
  invoiceFileKey: string | null;
  invoiceFile: 'removed' | 'already-missing' | 'not-present';
  nextInitialization: string;
}

function dataSource(): DataSource {
  if (localDataSource === undefined) {
    throw new Error(
      'The pending-payment reset data source is not initialized.',
    );
  }
  return localDataSource;
}

function readInput(): ResetInput {
  const argumentsList = process.argv.slice(2);
  const applicationId = argumentsList
    .find((argument) => argument.startsWith('--application-id='))
    ?.slice('--application-id='.length)
    .trim();

  if (applicationId === undefined || applicationId === '') {
    throw new Error('Missing required --application-id=<uuid>.');
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      applicationId,
    )
  ) {
    throw new Error('The application ID must be a UUID.');
  }

  return { applicationId, execute: argumentsList.includes('--execute') };
}

function assertSafety(input: ResetInput): void {
  if (!RESET_ENVIRONMENTS.has(process.env.NODE_ENV ?? '')) {
    throw new Error(
      'This reset may only run with NODE_ENV=development or NODE_ENV=test. No database changes were made.',
    );
  }
  if (process.env.ALLOW_PENDING_PAYMENT_RESET !== RESET_CONFIRMATION) {
    throw new Error(
      'Set ALLOW_PENDING_PAYMENT_RESET=true to explicitly allow this targeted payment reset. No database changes were made.',
    );
  }
  if (!input.execute) {
    throw new Error(
      'Dry run only. Add --execute after verifying the target application ID.',
    );
  }
}

function invoiceFilePath(storageRoot: string, storageKey: string): string {
  const target = resolve(storageRoot, ...storageKey.split('/'));
  const pathFromRoot = relative(storageRoot, target);
  if (
    pathFromRoot === '' ||
    pathFromRoot.startsWith('..') ||
    isAbsolute(pathFromRoot)
  ) {
    throw new Error(
      'Unsafe invoice storage key; no database changes were made.',
    );
  }
  return target;
}

function nextInitialization(applicationStatus: ApplicationStatus): string {
  return applicationStatus === ApplicationStatus.DRAFT
    ? 'POST /applications/:applicationId/payment/initialize as the owning citizen'
    : 'POST /admin/payments/applications/:applicationId/initialize as an admin';
}

async function resetPendingPayment(
  manager: EntityManager,
  applicationId: string,
  storageRoot: string,
): Promise<Omit<ResetResult, 'invoiceFile'>> {
  // Match the initializer's lock order to prevent a concurrent initialization.
  const application = await manager.getRepository(RenewalApplication).findOne({
    where: { id: applicationId },
    lock: { mode: 'pessimistic_write' },
  });
  if (application === null) throw new Error('Application not found.');

  const payment = await manager.getRepository(Payment).findOne({
    where: { applicationId: application.id },
    lock: { mode: 'pessimistic_write' },
  });
  if (payment === null)
    throw new Error('Payment not found for this application.');
  if (payment.status !== PaymentStatus.PENDING) {
    throw new Error(
      `Only PENDING payments may be reset; this payment is ${payment.status}. Confirmed payments are immutable. No database changes were made.`,
    );
  }
  if (payment.method !== PaymentMethod.PAY_AT_STATION) {
    throw new Error(
      'Only PENDING PAY_AT_STATION payments may be reset by this development procedure. No database changes were made.',
    );
  }
  if (
    payment.receiptNumber !== null ||
    payment.confirmedAt !== null ||
    payment.confirmedByUserId !== null ||
    payment.receiptFileKey !== null ||
    payment.inspectionSheetFileKey !== null
  ) {
    throw new Error(
      'The payment contains paid-payment data and cannot be reset. No database changes were made.',
    );
  }
  if (
    application.status !== ApplicationStatus.DRAFT &&
    application.status !== ApplicationStatus.APPROVED
  ) {
    throw new Error(
      'Only DRAFT or APPROVED applications can be reset because their normal initializer can create a replacement payment. No database changes were made.',
    );
  }

  if (payment.invoiceFileKey !== null) {
    invoiceFilePath(storageRoot, payment.invoiceFileKey);
  }

  const historyResult = await manager
    .getRepository(PaymentStatusHistory)
    .delete({ paymentId: payment.id });
  await manager.getRepository(Payment).delete({ id: payment.id });

  return {
    applicationId: application.id,
    applicationStatus: application.status,
    paymentId: payment.id,
    oldInvoiceNumber: payment.invoiceNumber,
    removedPaymentStatusHistoryRows: historyResult.affected ?? 0,
    invoiceFileKey: payment.invoiceFileKey,
    nextInitialization: nextInitialization(application.status),
  };
}

async function removeInvoiceFile(
  storageRoot: string,
  storageKey: string | null,
): Promise<ResetResult['invoiceFile']> {
  if (storageKey === null) return 'not-present';
  try {
    await unlink(invoiceFilePath(storageRoot, storageKey));
    return 'removed';
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return 'already-missing';
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const input = readInput();
  assertSafety(input);

  localDataSource = (
    requireFromScript('../src/database/data-source') as { default: DataSource }
  ).default;
  const storageRoot = resolve(
    process.cwd(),
    process.env.PRIVATE_STORAGE_ROOT ?? 'storage/private',
  );

  await dataSource().initialize();
  try {
    const reset = await dataSource().transaction((manager) =>
      resetPendingPayment(manager, input.applicationId, storageRoot),
    );
    const invoiceFile = await removeInvoiceFile(
      storageRoot,
      reset.invoiceFileKey,
    );
    console.log(JSON.stringify({ ...reset, invoiceFile }, null, 2));
  } finally {
    await dataSource().destroy();
  }
}

void main().catch((error: unknown) => {
  console.error(
    `Pending-payment reset aborted: ${error instanceof Error ? error.message : 'Unknown error.'}`,
  );
  process.exitCode = 1;
});
