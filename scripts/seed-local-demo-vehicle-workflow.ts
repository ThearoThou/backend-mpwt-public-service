import { createRequire } from 'node:module';
import type { DataSource, EntityManager } from 'typeorm';

import {
  normalizeCambodianPhone,
  normalizeEmail,
} from '../src/auth/identifier-normalization';
import { RenewalApplicationStatusHistory } from '../src/applications/entities/renewal-application-status-history.entity';
import { RenewalApplication } from '../src/applications/entities/renewal-application.entity';
import { ApplicationStatus } from '../src/applications/enums/application-status.enum';
import { InspectionVehicleCategory } from '../src/inspection-categories/entities/inspection-vehicle-category.entity';
import { Inspection } from '../src/inspections/entities/inspection.entity';
import { InspectionResult } from '../src/inspections/enums/inspection-result.enum';
import { InspectionStatus } from '../src/inspections/enums/inspection-status.enum';
import { Payment } from '../src/payments/entities/payment.entity';
import { PaymentStatusHistory } from '../src/payments/entities/payment-status-history.entity';
import { PaymentMethod } from '../src/payments/enums/payment-method.enum';
import { PaymentStatus } from '../src/payments/enums/payment-status.enum';
import { Appointment } from '../src/scheduling/entities/appointment.entity';
import { InspectionStationDailyCapacity } from '../src/scheduling/entities/inspection-station-daily-capacity.entity';
import { InspectionStation } from '../src/scheduling/entities/inspection-station.entity';
import { AppointmentStatus } from '../src/scheduling/enums/appointment-status.enum';
import { Sticker } from '../src/stickers/entities/sticker.entity';
import { CitizenProfile } from '../src/users/entities/citizen-profile.entity';
import { User } from '../src/users/entities/user.entity';
import { UserRole } from '../src/users/enums/user-role.enum';
import { UserStatus } from '../src/users/enums/user-status.enum';
import { Vehicle } from '../src/vehicles/entities/vehicle.entity';
import { VehicleClass } from '../src/vehicles/enums/vehicle-class.enum';
import {
  LOCAL_DEMO_DATASET,
  LOCAL_DEMO_REGISTRATIONS,
  LOCAL_DEMO_VEHICLES,
  type LocalDemoVehicleFixture,
} from './local-demo-vehicle-fixtures';

const LOCAL_SEED_ENVIRONMENT = 'development';
const LOCAL_SEED_CONFIRMATION = 'true';
const CYCLE_DAYS = 365;
let localDataSource: DataSource | undefined;
const requireFromScript = createRequire(__filename);

interface SeedCitizen {
  id: string;
  profile: CitizenProfile;
  phone: string;
}
interface SeedResult {
  created: string[];
  migrated: string[];
  skipped: string[];
  historicalApplicationsCreated: number;
  historicalApplicationsSkipped: number;
  anchorDate: string;
}
interface HistoricalCycle {
  cycle: number;
  firstInspectionDate: string;
  finalPassDate: string;
  failedFirstAttempt: boolean;
}

function readCitizenSelector(prefix: 'citizen' | 'other-citizen'): {
  email?: string;
  id?: string;
} {
  const id = process.argv
    .slice(2)
    .find((argument) => argument.startsWith(`--${prefix}-id=`))
    ?.slice(`--${prefix}-id=`.length)
    .trim();
  const email = process.argv
    .slice(2)
    .find((argument) => argument.startsWith(`--${prefix}-email=`))
    ?.slice(`--${prefix}-email=`.length)
    .trim();
  if (id !== undefined && id !== '') return { id };
  if (email !== undefined && email !== '') return { email };
  throw new Error(
    `Missing required selector: --${prefix}-id=<uuid> or --${prefix}-email=<email>.`,
  );
}
function assertLocalDevelopmentSafety(): void {
  if (process.env.NODE_ENV !== LOCAL_SEED_ENVIRONMENT)
    throw new Error(
      'This seed may only run with NODE_ENV=development. No database changes were made.',
    );
  if (process.env.ALLOW_LOCAL_VEHICLE_SEED !== LOCAL_SEED_CONFIRMATION)
    throw new Error(
      'Set ALLOW_LOCAL_VEHICLE_SEED=true to explicitly allow local fixture insertion. No database changes were made.',
    );
}
function dataSource(): DataSource {
  if (localDataSource === undefined)
    throw new Error('The local seed data source has not been initialized.');
  return localDataSource;
}
function loadValidatedDataSource(): DataSource {
  return (
    requireFromScript('../src/database/data-source') as { default: DataSource }
  ).default;
}
async function resolveCitizen(
  manager: EntityManager,
  selector: { email?: string; id?: string },
): Promise<SeedCitizen> {
  const users = await manager.getRepository(User).find({
    where:
      selector.id === undefined
        ? { email: normalizeEmail(selector.email as string) }
        : { id: selector.id },
    relations: { citizenProfile: true },
  });
  const user = users[0];
  if (
    users.length !== 1 ||
    user === undefined ||
    user.role !== UserRole.CITIZEN ||
    user.status !== UserStatus.ACTIVE ||
    user.citizenProfile === null ||
    user.phone === null
  )
    throw new Error(
      'Expected one ACTIVE citizen with a profile and phone number.',
    );
  return {
    id: user.id,
    profile: user.citizenProfile,
    phone: normalizeCambodianPhone(user.phone),
  };
}
async function resolveAdministrator(manager: EntityManager): Promise<string> {
  const users = await manager.getRepository(User).find({
    where: { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
    select: { id: true },
  });
  if (users.length !== 1 || users[0] === undefined)
    throw new Error(
      'Expected exactly one ACTIVE ADMIN for local fixture data.',
    );
  return users[0].id;
}
async function resolveCategories(
  manager: EntityManager,
): Promise<Map<VehicleClass, InspectionVehicleCategory>> {
  const categories = await manager
    .getRepository(InspectionVehicleCategory)
    .find({ where: { isActive: true }, order: { createdAt: 'ASC' } });
  const output = new Map<VehicleClass, InspectionVehicleCategory>();
  for (const category of categories)
    if (!output.has(category.vehicleClass))
      output.set(category.vehicleClass, category);
  if (!output.has(VehicleClass.LIGHT) || !output.has(VehicleClass.HEAVY))
    throw new Error(
      'Active LIGHT and HEAVY inspection categories are required.',
    );
  return output;
}
async function cambodiaToday(manager: EntityManager): Promise<string> {
  const [clock] = await manager.query<{ today: string }[]>(
    `SELECT (now() AT TIME ZONE 'Asia/Phnom_Penh')::date::text AS "today"`,
  );
  if (clock === undefined)
    throw new Error('Cambodia-local seed clock unavailable.');
  return clock.today;
}
function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function at(date: string, hourUtc: number): Date {
  return new Date(`${date}T${hourUtc.toString().padStart(2, '0')}:00:00.000Z`);
}
function compact(date: string): string {
  return date.replaceAll('-', '');
}
function referenceFor(date: string, slot: number, cycle: number): string {
  return `VIR-${compact(date)}-A${slot}${cycle}${'0'.repeat(9)}`;
}
function invoiceFor(date: string, slot: number, cycle: number): string {
  return `INV-${compact(date)}-${(slot * 10 + cycle).toString().padStart(6, '0')}`;
}
function receiptFor(date: string, slot: number, cycle: number): string {
  return `RCP-${compact(date)}-${(slot * 10 + cycle).toString().padStart(6, '0')}`;
}
function stickerFor(date: string, slot: number, cycle: number): string {
  return `STK-${compact(date)}-${slot}${cycle}`;
}
function cyclesFor(
  fixture: LocalDemoVehicleFixture,
  anchorDate: string,
): HistoricalCycle[] {
  const latestPass = addDays(
    addDays(anchorDate, fixture.expiryOffsetDays),
    -CYCLE_DAYS,
  );
  if (fixture.history === 'ONE_PASS')
    return [
      {
        cycle: 1,
        firstInspectionDate: latestPass,
        finalPassDate: latestPass,
        failedFirstAttempt: false,
      },
    ];
  const olderPass = addDays(latestPass, -CYCLE_DAYS);
  if (fixture.history === 'TWO_PASS')
    return [
      {
        cycle: 1,
        firstInspectionDate: olderPass,
        finalPassDate: olderPass,
        failedFirstAttempt: false,
      },
      {
        cycle: 2,
        firstInspectionDate: latestPass,
        finalPassDate: latestPass,
        failedFirstAttempt: false,
      },
    ];
  return [
    {
      cycle: 1,
      firstInspectionDate: olderPass,
      finalPassDate: olderPass,
      failedFirstAttempt: false,
    },
    {
      cycle: 2,
      firstInspectionDate: addDays(latestPass, -14),
      finalPassDate: latestPass,
      failedFirstAttempt: true,
    },
  ];
}
async function existingAnchorDate(
  manager: EntityManager,
): Promise<string | null> {
  const [row] = await manager.query<{ anchorDate: string | null }[]>(
    `SELECT application."applicant_snapshot" ->> 'fixtureAnchorDate' AS "anchorDate"
       FROM "renewal_applications" application INNER JOIN "vehicles" vehicle ON vehicle."id" = application."vehicle_id"
      WHERE vehicle."registration_number" = ANY($1::text[]) AND application."applicant_snapshot" ->> 'fixture' = $2
      ORDER BY application."created_at" ASC LIMIT 1`,
    [LOCAL_DEMO_REGISTRATIONS, LOCAL_DEMO_DATASET],
  );
  return row?.anchorDate ?? null;
}
async function assertNoLegacyWorkflow(
  manager: EntityManager,
  vehicleIds: string[],
): Promise<void> {
  if (vehicleIds.length === 0) return;
  const rows = await manager.query<{ fixture: string | null }[]>(
    `SELECT "applicant_snapshot" ->> 'fixture' AS "fixture" FROM "renewal_applications" WHERE "vehicle_id" = ANY($1::uuid[])`,
    [vehicleIds],
  );
  if (rows.some((row) => row.fixture !== LOCAL_DEMO_DATASET))
    throw new Error(
      'Legacy workflow exists for a local demo vehicle. Run the explicit reset command first.',
    );
}
function snapshot(vehicle: Vehicle): Record<string, unknown> {
  return {
    vehicleId: vehicle.id,
    registrationNumber: vehicle.registrationNumber,
    plateNumber: vehicle.plateNumber,
    plateCategory: vehicle.plateCategory,
    plateProvince: vehicle.plateProvince,
    plateType: vehicle.plateType,
    vehicleType: vehicle.vehicleType,
    vehicleClass: vehicle.vehicleClass,
    inspectionCategoryId: vehicle.inspectionCategoryId,
    make: vehicle.make,
    model: vehicle.model,
    manufactureYear: vehicle.manufactureYear,
    chassisNumber: vehicle.chassisNumber,
    firstRegistrationDate: vehicle.firstRegistrationDate,
    lastInspectionDate: vehicle.lastInspectionDate,
    inspectionExpiryDate: vehicle.inspectionExpiryDate,
  };
}
async function findFixtureVehicle(
  manager: EntityManager,
  fixture: LocalDemoVehicleFixture,
): Promise<Vehicle | null> {
  const repository = manager.getRepository(Vehicle);
  const [legacy, current] = await Promise.all([
    repository.findOneBy({
      registrationNumber: fixture.legacyRegistrationNumber,
    }),
    repository.findOneBy({ registrationNumber: fixture.registrationNumber }),
  ]);
  if (legacy !== null && current !== null && legacy.id !== current.id)
    throw new Error(
      `Both legacy and current registrations exist for slot ${fixture.slot}.`,
    );
  return current ?? legacy;
}
async function upsertVehicles(
  manager: EntityManager,
  citizen: SeedCitizen,
  administratorId: string,
  categories: Map<VehicleClass, InspectionVehicleCategory>,
  anchorDate: string,
  result: SeedResult,
): Promise<Map<number, Vehicle>> {
  const repository = manager.getRepository(Vehicle);
  const found = new Map<number, Vehicle | null>();
  for (const fixture of LOCAL_DEMO_VEHICLES)
    found.set(fixture.slot, await findFixtureVehicle(manager, fixture));
  await assertNoLegacyWorkflow(
    manager,
    Array.from(found.values()).flatMap((vehicle) =>
      vehicle === null ? [] : [vehicle.id],
    ),
  );
  const output = new Map<number, Vehicle>();
  for (const fixture of LOCAL_DEMO_VEHICLES) {
    const category = categories.get(fixture.vehicleClass);
    if (category === undefined)
      throw new Error(`No active ${fixture.vehicleClass} category.`);
    const expiryDate = addDays(anchorDate, fixture.expiryOffsetDays);
    const registeredOwnerNameKh = citizen.profile.nameKh;
    if (registeredOwnerNameKh === null)
      throw new Error(
        'Citizen must have a Khmer name for the required vehicle owner snapshot.',
      );
    const registeredOwnerNameEn = citizen.profile.nameEn;
    if (registeredOwnerNameEn === null)
      throw new Error(
        'Citizen must have an English name for the required vehicle owner snapshot.',
      );
    const values = {
      linkedCitizenId: citizen.id,
      registrationNumber: fixture.registrationNumber,
      plateNumber: fixture.plateNumber,
      plateCategory: fixture.plateCategory,
      plateProvince: fixture.plateProvince,
      plateType: fixture.plateType,
      vehicleType: fixture.vehicleType,
      vehicleClass: fixture.vehicleClass,
      inspectionCategoryId: category.id,
      classificationVerifiedAt: new Date(),
      classificationVerifiedBy: administratorId,
      make: fixture.make,
      model: fixture.model,
      manufactureYear: fixture.manufactureYear,
      chassisNumber: fixture.chassisNumber,
      firstRegistrationDate: fixture.firstRegistrationDate,
      lastInspectionDate: addDays(expiryDate, -CYCLE_DAYS),
      inspectionExpiryDate: expiryDate,
      registeredOwnerNameKh,
      registeredOwnerNameEn,
      registeredOwnerPhone: citizen.phone,
      isActive: true,
    };
    const existing = found.get(fixture.slot) ?? null;
    if (existing === null) {
      output.set(
        fixture.slot,
        await repository.save(repository.create(values)),
      );
      result.created.push(fixture.registrationNumber);
      continue;
    }
    if (existing.linkedCitizenId !== citizen.id)
      throw new Error(
        `Fixture slot ${fixture.slot} is owned by another citizen.`,
      );
    if (existing.registrationNumber !== fixture.legacyRegistrationNumber) {
      const match =
        existing.registrationNumber === values.registrationNumber &&
        existing.plateNumber === values.plateNumber &&
        existing.plateCategory === values.plateCategory &&
        existing.plateProvince === values.plateProvince &&
        existing.plateType === values.plateType &&
        existing.vehicleType === values.vehicleType &&
        existing.vehicleClass === values.vehicleClass &&
        existing.inspectionCategoryId === values.inspectionCategoryId &&
        existing.make === values.make &&
        existing.model === values.model &&
        existing.manufactureYear === values.manufactureYear &&
        existing.chassisNumber === values.chassisNumber &&
        existing.firstRegistrationDate === values.firstRegistrationDate &&
        existing.lastInspectionDate === values.lastInspectionDate &&
        existing.inspectionExpiryDate === values.inspectionExpiryDate &&
        existing.registeredOwnerNameKh === values.registeredOwnerNameKh &&
        existing.registeredOwnerNameEn === values.registeredOwnerNameEn &&
        existing.registeredOwnerPhone === values.registeredOwnerPhone &&
        existing.isActive;
      if (!match)
        throw new Error(
          `Current local fixture slot ${fixture.slot} differs from the expected seed. It was not modified.`,
        );
      output.set(fixture.slot, existing);
      result.skipped.push(fixture.registrationNumber);
      continue;
    }
    output.set(
      fixture.slot,
      await repository.save(repository.merge(existing, values)),
    );
    result.migrated.push(fixture.registrationNumber);
  }
  return output;
}
async function reserveHistoricalCapacity(
  manager: EntityManager,
  stationId: string,
  capacityDate: string,
): Promise<InspectionStationDailyCapacity> {
  const repository = manager.getRepository(InspectionStationDailyCapacity);
  let capacity = await repository.findOne({
    where: { stationId, capacityDate },
  });
  if (capacity === null)
    capacity = repository.create({
      stationId,
      capacityDate,
      dailyCapacity: 20,
      reservedCount: 0,
      isClosed: false,
    });
  if (capacity.reservedCount >= capacity.dailyCapacity)
    throw new Error(`Historical capacity is full for ${capacityDate}.`);
  capacity.reservedCount += 1;
  return repository.save(capacity);
}
async function createCompletedAttempt(
  manager: EntityManager,
  applicationId: string,
  station: InspectionStation,
  date: string,
  attemptNumber: number,
  result: InspectionResult,
  administratorId: string,
  failureReason: string | null,
): Promise<Inspection> {
  const capacity = await reserveHistoricalCapacity(manager, station.id, date);
  const appointment = await manager.getRepository(Appointment).save(
    manager.getRepository(Appointment).create({
      applicationId,
      dailyCapacityId: capacity.id,
      slotId: null,
      status: AppointmentStatus.COMPLETED,
      bookedAt: at(addDays(date, -2), 3),
      completedAt: at(date, 3),
      cancelledAt: null,
      cancelledByUserId: null,
      cancellationReason: null,
      noShowMarkedAt: null,
      noShowMarkedByUserId: null,
    }),
  );
  return manager.getRepository(Inspection).save(
    manager.getRepository(Inspection).create({
      applicationId,
      appointmentId: appointment.id,
      attemptNumber,
      status: InspectionStatus.COMPLETED,
      result,
      recordedByUserId: administratorId,
      startedAt: at(date, 1),
      completedAt: at(date, 3),
      failureReason,
      notes: null,
    }),
  );
}
async function createHistoricalCycle(
  manager: EntityManager,
  fixture: LocalDemoVehicleFixture,
  vehicle: Vehicle,
  cycle: HistoricalCycle,
  citizenId: string,
  administratorId: string,
  category: InspectionVehicleCategory,
  station: InspectionStation,
  anchorDate: string,
): Promise<void> {
  const applicationDate = addDays(cycle.firstInspectionDate, -12);
  const submittedDate = addDays(cycle.firstInspectionDate, -10);
  const approvedDate = addDays(cycle.firstInspectionDate, -2);
  const completedAt = at(cycle.finalPassDate, 4);
  const application = await manager.getRepository(RenewalApplication).save(
    manager.getRepository(RenewalApplication).create({
      referenceNumber: referenceFor(
        cycle.firstInspectionDate,
        fixture.slot,
        cycle.cycle,
      ),
      citizenId,
      vehicleId: vehicle.id,
      status: ApplicationStatus.COMPLETED,
      applicantSnapshot: {
        fixture: LOCAL_DEMO_DATASET,
        fixtureAnchorDate: anchorDate,
      },
      vehicleSnapshot: snapshot(vehicle),
      currentCorrectionReason: null,
      currentRejectionReason: null,
      preferredInspectionStationId: station.id,
      preferredInspectionDate: cycle.firstInspectionDate,
      submittedAt: at(submittedDate, 2),
      reviewStartedAt: at(addDays(cycle.firstInspectionDate, -8), 2),
      readyForInspectionAt: at(approvedDate, 2),
      completedAt,
      cancelledAt: null,
      cancelledByUserId: null,
      cancellationReason: null,
      createdAt: at(applicationDate, 2),
      updatedAt: completedAt,
    }),
  );
  const history = manager.getRepository(RenewalApplicationStatusHistory);
  const transitions: Array<
    [ApplicationStatus | null, ApplicationStatus, Date, string]
  > = [
    [
      null,
      ApplicationStatus.DRAFT,
      at(applicationDate, 2),
      'LOCAL_DEMO_CREATED',
    ],
    [
      ApplicationStatus.DRAFT,
      ApplicationStatus.SUBMITTED,
      at(submittedDate, 2),
      'LOCAL_DEMO_SUBMITTED',
    ],
    [
      ApplicationStatus.SUBMITTED,
      ApplicationStatus.UNDER_REVIEW,
      at(addDays(cycle.firstInspectionDate, -8), 2),
      'LOCAL_DEMO_REVIEWED',
    ],
    [
      ApplicationStatus.UNDER_REVIEW,
      ApplicationStatus.APPROVED,
      at(approvedDate, 2),
      'LOCAL_DEMO_APPROVED',
    ],
    [
      ApplicationStatus.APPROVED,
      ApplicationStatus.COMPLETED,
      completedAt,
      'STICKER_ISSUED',
    ],
  ];
  for (const [previousStatus, newStatus, createdAt, reason] of transitions)
    await history.save(
      history.create({
        applicationId: application.id,
        previousStatus,
        newStatus,
        changedByUserId: administratorId,
        reason,
        createdAt,
      }),
    );
  const baseAmount = (
    Number(category.inspectionFeeKhr) + Number(category.serviceFeeKhr)
  ).toFixed(2);
  const payment = await manager.getRepository(Payment).save(
    manager.getRepository(Payment).create({
      applicationId: application.id,
      invoiceNumber: invoiceFor(submittedDate, fixture.slot, cycle.cycle),
      receiptNumber: receiptFor(cycle.finalPassDate, fixture.slot, cycle.cycle),
      method: PaymentMethod.PAY_AT_STATION,
      status: PaymentStatus.CONFIRMED,
      inspectionFeeKhr: category.inspectionFeeKhr,
      serviceFeeKhr: category.serviceFeeKhr,
      baseAmount,
      previousInspectionExpiryDate: addDays(cycle.firstInspectionDate, -1),
      lateDays: 0,
      lateFee: '0.00',
      totalAmount: baseAmount,
      currency: 'KHR',
      paymentReference: `CASH-${fixture.slot}${cycle.cycle}`,
      providerName: null,
      providerTransactionId: null,
      confirmedByUserId: administratorId,
      confirmedAt: at(addDays(cycle.firstInspectionDate, -1), 2),
      failedAt: null,
      failureReason: null,
      rejectedAt: null,
      rejectedByUserId: null,
      rejectionReason: null,
      invoiceIssuedAt: at(addDays(cycle.firstInspectionDate, -6), 2),
      invoiceFileKey: null,
      receiptFileKey: null,
      inspectionSheetFileKey: null,
      createdAt: at(addDays(cycle.firstInspectionDate, -6), 2),
      updatedAt: at(addDays(cycle.firstInspectionDate, -1), 2),
    }),
  );
  await manager.getRepository(PaymentStatusHistory).save(
    manager.getRepository(PaymentStatusHistory).create({
      paymentId: payment.id,
      fromStatus: PaymentStatus.PENDING,
      toStatus: PaymentStatus.CONFIRMED,
      changedByUserId: administratorId,
      reason: 'LOCAL_DEMO_CASH_CONFIRMED',
      createdAt: at(addDays(cycle.firstInspectionDate, -1), 2),
    }),
  );
  let pass: Inspection;
  if (cycle.failedFirstAttempt) {
    await createCompletedAttempt(
      manager,
      application.id,
      station,
      cycle.firstInspectionDate,
      1,
      InspectionResult.FAIL,
      administratorId,
      'Lighting system requires correction',
    );
    pass = await createCompletedAttempt(
      manager,
      application.id,
      station,
      cycle.finalPassDate,
      2,
      InspectionResult.PASS,
      administratorId,
      null,
    );
  } else {
    pass = await createCompletedAttempt(
      manager,
      application.id,
      station,
      cycle.finalPassDate,
      1,
      InspectionResult.PASS,
      administratorId,
      null,
    );
  }
  await manager.getRepository(Sticker).save(
    manager.getRepository(Sticker).create({
      applicationId: application.id,
      inspectionId: pass.id,
      stickerNumber: stickerFor(cycle.finalPassDate, fixture.slot, cycle.cycle),
      issuedAt: completedAt,
      issuedByUserId: administratorId,
      createdAt: completedAt,
      updatedAt: completedAt,
    }),
  );
}
async function seedHistoricalWorkflow(
  manager: EntityManager,
  vehicles: Map<number, Vehicle>,
  citizenId: string,
  administratorId: string,
  categories: Map<VehicleClass, InspectionVehicleCategory>,
  anchorDate: string,
  result: SeedResult,
): Promise<void> {
  const stations = await manager
    .getRepository(InspectionStation)
    .find({ where: { isActive: true }, order: { createdAt: 'ASC' } });
  if (stations.length === 0)
    throw new Error('At least one active inspection station is required.');
  for (const fixture of LOCAL_DEMO_VEHICLES) {
    const cycles = cyclesFor(fixture, anchorDate);
    const references = cycles.map((cycle) =>
      referenceFor(cycle.firstInspectionDate, fixture.slot, cycle.cycle),
    );
    const existing = await manager.getRepository(RenewalApplication).find({
      where: references.map((referenceNumber) => ({ referenceNumber })),
    });
    if (existing.length === cycles.length) {
      if (
        existing.some(
          (application) =>
            application.vehicleId !== vehicles.get(fixture.slot)?.id,
        )
      )
        throw new Error(
          `Historical reference collision for slot ${fixture.slot}.`,
        );
      result.historicalApplicationsSkipped += existing.length;
      continue;
    }
    if (existing.length !== 0)
      throw new Error(
        `Partial historical workflow exists for slot ${fixture.slot}.`,
      );
    const vehicle = vehicles.get(fixture.slot);
    const category = categories.get(fixture.vehicleClass);
    if (vehicle === undefined || category === undefined)
      throw new Error(`Fixture setup missing for slot ${fixture.slot}.`);
    for (const cycle of cycles) {
      const station =
        stations[(fixture.slot + cycle.cycle - 2) % stations.length];
      await createHistoricalCycle(
        manager,
        fixture,
        vehicle,
        cycle,
        citizenId,
        administratorId,
        category,
        station,
        anchorDate,
      );
      result.historicalApplicationsCreated += 1;
    }
  }
}
async function seedFixtures(): Promise<SeedResult> {
  return dataSource().transaction(async (manager) => {
    const citizen = await resolveCitizen(
      manager,
      readCitizenSelector('citizen'),
    );
    const otherCitizen = await resolveCitizen(
      manager,
      readCitizenSelector('other-citizen'),
    );
    if (citizen.id === otherCitizen.id)
      throw new Error('Primary and ownership-isolation citizens must differ.');
    const administratorId = await resolveAdministrator(manager);
    const categories = await resolveCategories(manager);
    const anchorDate =
      (await existingAnchorDate(manager)) ?? (await cambodiaToday(manager));
    const result: SeedResult = {
      created: [],
      migrated: [],
      skipped: [],
      historicalApplicationsCreated: 0,
      historicalApplicationsSkipped: 0,
      anchorDate,
    };
    const vehicles = await upsertVehicles(
      manager,
      citizen,
      administratorId,
      categories,
      anchorDate,
      result,
    );
    await seedHistoricalWorkflow(
      manager,
      vehicles,
      citizen.id,
      administratorId,
      categories,
      anchorDate,
      result,
    );
    return result;
  });
}
async function main(): Promise<void> {
  assertLocalDevelopmentSafety();
  readCitizenSelector('citizen');
  readCitizenSelector('other-citizen');
  localDataSource = loadValidatedDataSource();
  await dataSource().initialize();
  try {
    const result = await seedFixtures();
    console.log(`Fixture anchor date: ${result.anchorDate}`);
    result.created.forEach((value) => console.log(`CREATED ${value}`));
    result.migrated.forEach((value) => console.log(`MIGRATED ${value}`));
    result.skipped.forEach((value) => console.log(`SKIPPED ${value}`));
    console.log(
      `Historical applications created: ${result.historicalApplicationsCreated}`,
    );
    console.log(
      `Historical applications skipped: ${result.historicalApplicationsSkipped}`,
    );
  } finally {
    await dataSource().destroy();
  }
}
void main().catch((error: unknown) => {
  console.error(
    `Local vehicle seed aborted: ${error instanceof Error ? error.message : 'Unknown error.'}`,
  );
  process.exitCode = 1;
});
