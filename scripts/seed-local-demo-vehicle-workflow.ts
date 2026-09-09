import { createRequire } from 'node:module';
import type { DataSource, EntityManager } from 'typeorm';

import {
  normalizeCambodianPhone,
  normalizeEmail,
} from '../src/auth/identifier-normalization';
import { RenewalApplicationStatusHistory } from '../src/applications/entities/renewal-application-status-history.entity';
import { InspectionVehicleCategory } from '../src/inspection-categories/entities/inspection-vehicle-category.entity';
import { RenewalApplication } from '../src/applications/entities/renewal-application.entity';
import { ApplicationStatus } from '../src/applications/enums/application-status.enum';
import { Inspection } from '../src/inspections/entities/inspection.entity';
import { InspectionResult } from '../src/inspections/enums/inspection-result.enum';
import { InspectionStatus } from '../src/inspections/enums/inspection-status.enum';
import { InspectionStation } from '../src/scheduling/entities/inspection-station.entity';
import { CitizenProfile } from '../src/users/entities/citizen-profile.entity';
import { User } from '../src/users/entities/user.entity';
import { UserRole } from '../src/users/enums/user-role.enum';
import { UserStatus } from '../src/users/enums/user-status.enum';
import { Vehicle } from '../src/vehicles/entities/vehicle.entity';
import { VehicleClass } from '../src/vehicles/enums/vehicle-class.enum';
import {
  LOCAL_DEMO_REGISTRATIONS,
  LOCAL_DEMO_VEHICLES,
  type LocalDemoVehicleFixture,
} from './local-demo-vehicle-fixtures';

const LOCAL_SEED_ENVIRONMENT = 'development';
const LOCAL_SEED_CONFIRMATION = 'true';
const CYCLE_DAYS = 365;
const requireFromScript = createRequire(__filename);

let localDataSource: DataSource | undefined;

interface SeedCitizen {
  id: string;
  profile: CitizenProfile;
  phone: string;
}

interface CategoryFixture {
  code: 'LOCAL-DEMO-LIGHT' | 'LOCAL-DEMO-HEAVY';
  nameKh: string;
  nameEn: string;
  vehicleClass: VehicleClass;
  inspectionFeeKhr: string;
  serviceFeeKhr: string;
  validityMonths: number;
}

interface SeedResult {
  vehiclesCreated: string[];
  vehiclesUpdated: string[];
  vehiclesUnchanged: string[];
  categoriesCreated: string[];
  categoriesUpdated: string[];
  categoriesUnchanged: string[];
  historicalApplicationsCreated: string[];
  historicalApplicationsUnchanged: string[];
  historicalInspectionsCreated: number;
  anchorDate: string;
}

interface HistoricalInspectionAttemptFixture {
  attemptNumber: 1 | 2;
  result: InspectionResult;
  stationCode: string;
  daysAfterLastInspection: number;
  failureReason?: string;
}

interface HistoricalApplicationFixture {
  referenceNumber: string;
  vehicleRegistrationNumber: string;
  finalStatus:
    ApplicationStatus.COMPLETED | ApplicationStatus.INSPECTION_FAILED;
  attempts: readonly HistoricalInspectionAttemptFixture[];
}

const LOCAL_DEMO_CATEGORIES: readonly CategoryFixture[] = [
  {
    code: 'LOCAL-DEMO-LIGHT',
    nameKh: 'យានយន្តស្រាល (សាកល្បង)',
    nameEn: 'Local demo light vehicle',
    vehicleClass: VehicleClass.LIGHT,
    inspectionFeeKhr: '48000.00',
    serviceFeeKhr: '0.00',
    validityMonths: 12,
  },
  {
    code: 'LOCAL-DEMO-HEAVY',
    nameKh: 'យានយន្តធុនធ្ងន់ (សាកល្បង)',
    nameEn: 'Local demo heavy vehicle',
    vehicleClass: VehicleClass.HEAVY,
    inspectionFeeKhr: '80000.00',
    serviceFeeKhr: '0.00',
    validityMonths: 12,
  },
];

function assertLocalDevelopmentSafety(): void {
  if (process.env.NODE_ENV !== LOCAL_SEED_ENVIRONMENT) {
    throw new Error(
      'This seed may only run with NODE_ENV=development. No database changes were made.',
    );
  }

  if (process.env.ALLOW_LOCAL_VEHICLE_SEED !== LOCAL_SEED_CONFIRMATION) {
    throw new Error(
      'Set ALLOW_LOCAL_VEHICLE_SEED=true to explicitly allow local fixture insertion. No database changes were made.',
    );
  }
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

function dataSource(): DataSource {
  if (localDataSource === undefined) {
    throw new Error('The local seed data source has not been initialized.');
  }

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
  ) {
    throw new Error(
      'Expected one ACTIVE citizen with a profile and phone number. No database changes were made.',
    );
  }

  if (user.citizenProfile.nameEn === null) {
    throw new Error(
      'Citizen must have an English name for the required vehicle owner data. No database changes were made.',
    );
  }

  return {
    id: user.id,
    profile: user.citizenProfile,
    phone: normalizeCambodianPhone(user.phone),
  };
}

async function resolveAdministrator(manager: EntityManager): Promise<string> {
  const users = await manager.getRepository(User).find({
    where: { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
    order: { createdAt: 'ASC' },
    select: { id: true },
  });

  if (users.length !== 1 || users[0] === undefined) {
    throw new Error(
      'Expected exactly one ACTIVE ADMIN for local fixture data. No database changes were made.',
    );
  }

  return users[0].id;
}

async function cambodiaToday(manager: EntityManager): Promise<string> {
  const [clock] = await manager.query<{ today: string }[]>(
    `SELECT (now() AT TIME ZONE 'Asia/Phnom_Penh')::date::text AS "today"`,
  );

  if (clock === undefined) {
    throw new Error('Cambodia-local seed clock unavailable.');
  }

  return clock.today;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

const HISTORY_STATION_CODES_BY_SLOT: Readonly<Record<number, string[]>> = {
  1: ['PP-RUSSEY-KEO', 'PP-NR6A'],
  2: ['PP-MONG-RETHY', 'BTB-VEHICLE-INSPECTION'],
  3: ['SR-VEHICLE-INSPECTION'],
  4: ['PP-VEAL-SBOV', 'PP-KAMBOL', 'PP-POR-SEN-CHEY-ODEM'],
  5: ['KPC-VEHICLE-INSPECTION'],
  6: [
    'KPS-VEHICLE-INSPECTION',
    'KRT-VEHICLE-INSPECTION',
    'PSH-VEHICLE-INSPECTION',
  ],
  7: ['PP-POR-SEN-CHEY-ODEM', 'PSH-VEHICLE-INSPECTION'],
  8: ['RTK-VEHICLE-INSPECTION', 'KCH-VEHICLE-INSPECTION'],
  9: [
    'PVH-VEHICLE-INSPECTION',
    'KTH-VEHICLE-INSPECTION',
    'BMC-VEHICLE-INSPECTION',
  ],
  10: [
    'SVR-VEHICLE-INSPECTION',
    'KPT-VEHICLE-INSPECTION',
    'TKO-VEHICLE-INSPECTION',
  ],
};

function historyReference(
  fixture: LocalDemoVehicleFixture,
  sequence: number,
): string {
  return `LDMO-HIST-${String(fixture.slot).padStart(2, '0')}-${sequence}`;
}

function historicalApplicationsForVehicle(
  fixture: LocalDemoVehicleFixture,
): HistoricalApplicationFixture[] {
  const stationCodes = HISTORY_STATION_CODES_BY_SLOT[fixture.slot];
  if (stationCodes === undefined) {
    throw new Error(
      `Missing historical station mapping for slot ${fixture.slot}.`,
    );
  }

  const pass = (
    sequence: number,
    stationCode: string,
    daysAfterLastInspection: number,
  ): HistoricalApplicationFixture => ({
    referenceNumber: historyReference(fixture, sequence),
    vehicleRegistrationNumber: fixture.registrationNumber,
    finalStatus: ApplicationStatus.COMPLETED,
    attempts: [
      {
        attemptNumber: 1,
        result: InspectionResult.PASS,
        stationCode,
        daysAfterLastInspection,
      },
    ],
  });

  if (fixture.history === 'TWO_PASS') {
    if (stationCodes.length !== 2) {
      throw new Error(
        `Expected two historical stations for slot ${fixture.slot}.`,
      );
    }
    return [pass(1, stationCodes[0], -CYCLE_DAYS), pass(2, stationCodes[1], 0)];
  }

  if (fixture.history === 'ONE_PASS') {
    if (stationCodes.length !== 1) {
      throw new Error(
        `Expected one historical station for slot ${fixture.slot}.`,
      );
    }
    return [pass(1, stationCodes[0], 0)];
  }

  if (stationCodes.length !== 3) {
    throw new Error(
      `Expected three historical stations for slot ${fixture.slot}.`,
    );
  }
  return [
    pass(1, stationCodes[0], -CYCLE_DAYS),
    {
      referenceNumber: historyReference(fixture, 2),
      vehicleRegistrationNumber: fixture.registrationNumber,
      finalStatus: ApplicationStatus.INSPECTION_FAILED,
      attempts: [
        {
          attemptNumber: 1,
          result: InspectionResult.FAIL,
          stationCode: stationCodes[1],
          daysAfterLastInspection: -14,
          failureReason: 'Brake performance requires correction.',
        },
      ],
    },
    pass(3, stationCodes[2], 0),
  ];
}

function inspectionTimestamp(date: string): Date {
  return new Date(`${date}T02:00:00.000Z`);
}

function historicalApplicationSnapshots(
  citizen: SeedCitizen,
  vehicle: Vehicle,
) {
  return {
    applicantSnapshot: {
      userId: citizen.id,
      nameKh: citizen.profile.nameKh,
      nameEn: citizen.profile.nameEn,
      nationalIdNumber: citizen.profile.nationalIdNumber,
      phone: citizen.phone,
      email: null,
      address: citizen.profile.address,
    },
    vehicleSnapshot: {
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
      registeredOwnerNameKh: vehicle.registeredOwnerNameKh,
      registeredOwnerNameEn: vehicle.registeredOwnerNameEn,
      registeredOwnerPhone: vehicle.registeredOwnerPhone,
    },
  };
}

function categoryMatches(
  category: InspectionVehicleCategory,
  fixture: CategoryFixture,
): boolean {
  return (
    category.nameKh === fixture.nameKh &&
    category.nameEn === fixture.nameEn &&
    category.vehicleClass === fixture.vehicleClass &&
    category.inspectionFeeKhr === fixture.inspectionFeeKhr &&
    category.serviceFeeKhr === fixture.serviceFeeKhr &&
    category.validityMonths === fixture.validityMonths &&
    category.isActive
  );
}

async function ensureDemoCategories(
  manager: EntityManager,
  result: SeedResult,
): Promise<Map<VehicleClass, InspectionVehicleCategory>> {
  const repository = manager.getRepository(InspectionVehicleCategory);
  const categories = new Map<VehicleClass, InspectionVehicleCategory>();

  for (const fixture of LOCAL_DEMO_CATEGORIES) {
    const existing = await repository.findOneBy({ code: fixture.code });
    const values = { ...fixture, isActive: true };
    const category =
      existing === null
        ? await repository.save(repository.create(values))
        : categoryMatches(existing, fixture)
          ? existing
          : await repository.save(repository.merge(existing, values));

    if (existing === null) result.categoriesCreated.push(fixture.code);
    else if (category === existing)
      result.categoriesUnchanged.push(fixture.code);
    else result.categoriesUpdated.push(fixture.code);

    categories.set(fixture.vehicleClass, category);
  }

  return categories;
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

  if (legacy !== null && current !== null && legacy.id !== current.id) {
    throw new Error(
      `Both legacy and current registrations exist for slot ${fixture.slot}. Run the local reset first.`,
    );
  }

  return current ?? legacy;
}

async function assertNoWorkflow(
  manager: EntityManager,
  vehicleId: string,
  registrationNumber: string,
): Promise<void> {
  const count = await manager.getRepository(RenewalApplication).count({
    where: { vehicleId },
  });

  if (count !== 0) {
    throw new Error(
      `${registrationNumber} has renewal workflow data. Run the guarded local reset before changing demo fixtures.`,
    );
  }
}

function vehicleMatches(
  vehicle: Vehicle,
  values: Pick<
    Vehicle,
    | 'linkedCitizenId'
    | 'registrationNumber'
    | 'plateNumber'
    | 'plateCategory'
    | 'plateProvince'
    | 'plateType'
    | 'vehicleType'
    | 'vehicleClass'
    | 'inspectionCategoryId'
    | 'make'
    | 'model'
    | 'manufactureYear'
    | 'chassisNumber'
    | 'firstRegistrationDate'
    | 'lastInspectionDate'
    | 'inspectionExpiryDate'
    | 'registeredOwnerNameKh'
    | 'registeredOwnerNameEn'
    | 'registeredOwnerPhone'
    | 'isActive'
  >,
): boolean {
  return (
    vehicle.linkedCitizenId === values.linkedCitizenId &&
    vehicle.registrationNumber === values.registrationNumber &&
    vehicle.plateNumber === values.plateNumber &&
    vehicle.plateCategory === values.plateCategory &&
    vehicle.plateProvince === values.plateProvince &&
    vehicle.plateType === values.plateType &&
    vehicle.vehicleType === values.vehicleType &&
    vehicle.vehicleClass === values.vehicleClass &&
    vehicle.inspectionCategoryId === values.inspectionCategoryId &&
    vehicle.classificationVerifiedAt !== null &&
    vehicle.classificationVerifiedBy !== null &&
    vehicle.make === values.make &&
    vehicle.model === values.model &&
    vehicle.manufactureYear === values.manufactureYear &&
    vehicle.chassisNumber === values.chassisNumber &&
    vehicle.firstRegistrationDate === values.firstRegistrationDate &&
    vehicle.lastInspectionDate === values.lastInspectionDate &&
    vehicle.inspectionExpiryDate === values.inspectionExpiryDate &&
    vehicle.registeredOwnerNameKh === values.registeredOwnerNameKh &&
    vehicle.registeredOwnerNameEn === values.registeredOwnerNameEn &&
    vehicle.registeredOwnerPhone === values.registeredOwnerPhone &&
    vehicle.isActive
  );
}

async function upsertVehicles(
  manager: EntityManager,
  citizen: SeedCitizen,
  administratorId: string,
  categories: Map<VehicleClass, InspectionVehicleCategory>,
  anchorDate: string,
  result: SeedResult,
): Promise<void> {
  const repository = manager.getRepository(Vehicle);

  for (const fixture of LOCAL_DEMO_VEHICLES) {
    const category = categories.get(fixture.vehicleClass);
    if (category === undefined) {
      throw new Error(
        `No explicit local demo category for ${fixture.vehicleClass}.`,
      );
    }

    const expiryDate = addDays(anchorDate, fixture.expiryOffsetDays);
    const registeredOwnerNameEn = citizen.profile.nameEn;
    if (registeredOwnerNameEn === null) {
      throw new Error(
        'Citizen must have an English name for the required vehicle owner data.',
      );
    }
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
      registeredOwnerNameKh: citizen.profile.nameKh,
      registeredOwnerNameEn,
      registeredOwnerPhone: citizen.phone,
      isActive: true,
    };
    const existing = await findFixtureVehicle(manager, fixture);

    if (existing === null) {
      await repository.save(repository.create(values));
      result.vehiclesCreated.push(fixture.registrationNumber);
      continue;
    }

    if (existing.linkedCitizenId !== citizen.id) {
      throw new Error(
        `Fixture slot ${fixture.slot} is owned by another citizen. No database changes were made.`,
      );
    }

    if (vehicleMatches(existing, values)) {
      result.vehiclesUnchanged.push(fixture.registrationNumber);
      continue;
    }

    await assertNoWorkflow(manager, existing.id, fixture.registrationNumber);

    await repository.save(repository.merge(existing, values));
    result.vehiclesUpdated.push(fixture.registrationNumber);
  }
}

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function sameTimestamp(left: Date | null, right: Date): boolean {
  return left !== null && left.getTime() === right.getTime();
}

async function seedHistoricalInspections(
  manager: EntityManager,
  citizen: SeedCitizen,
  administratorId: string,
  result: SeedResult,
): Promise<void> {
  const vehicles = await manager.getRepository(Vehicle).find({
    where: {
      linkedCitizenId: citizen.id,
    },
  });
  const vehicleByRegistration = new Map(
    vehicles.map((vehicle) => [vehicle.registrationNumber, vehicle]),
  );
  const plans = LOCAL_DEMO_VEHICLES.flatMap((fixture) => {
    const vehicle = vehicleByRegistration.get(fixture.registrationNumber);
    if (vehicle === undefined) {
      throw new Error(
        `Historical inspection fixture vehicle ${fixture.registrationNumber} is unavailable.`,
      );
    }
    const lastInspectionDate = vehicle.lastInspectionDate;
    if (lastInspectionDate === null) {
      throw new Error(
        `Historical inspection fixture vehicle ${fixture.registrationNumber} has no last inspection date.`,
      );
    }
    return historicalApplicationsForVehicle(fixture).map((plan) => ({
      plan,
      vehicle,
      lastInspectionDate,
    }));
  });
  const stationCodes = [
    ...new Set(
      plans.flatMap(({ plan }) =>
        plan.attempts.map((attempt) => attempt.stationCode),
      ),
    ),
  ];
  const stations = await manager.getRepository(InspectionStation).find({
    where: { isActive: true },
  });
  const stationIdByCode = new Map(
    stations
      .filter((station) => stationCodes.includes(station.code))
      .map((station) => [station.code, station.id]),
  );
  if (stationIdByCode.size !== stationCodes.length) {
    throw new Error(
      'One or more historical inspection stations are unavailable or inactive.',
    );
  }

  const applications = manager.getRepository(RenewalApplication);
  const inspections = manager.getRepository(Inspection);
  const statusHistory = manager.getRepository(RenewalApplicationStatusHistory);

  for (const { plan, vehicle, lastInspectionDate } of plans) {
    if (plan.attempts.length !== 1 || plan.attempts[0]?.attemptNumber !== 1) {
      throw new Error(
        `${plan.referenceNumber} must contain exactly one attempt-number-one historical inspection.`,
      );
    }
    const attempts = plan.attempts.map((attempt) => ({
      ...attempt,
      completedAt: inspectionTimestamp(
        addDays(lastInspectionDate, attempt.daysAfterLastInspection),
      ),
      stationId: stationIdByCode.get(attempt.stationCode),
    }));
    const firstCompletedAt = attempts[0]?.completedAt;
    const lastCompletedAt = attempts.at(-1)?.completedAt;
    if (firstCompletedAt === undefined || lastCompletedAt === undefined) {
      throw new Error(
        `Historical inspection plan ${plan.referenceNumber} is empty.`,
      );
    }
    const existing = await applications.findOneBy({
      referenceNumber: plan.referenceNumber,
    });

    if (existing !== null) {
      const existingInspections = await inspections.find({
        where: { applicationId: existing.id },
        order: { attemptNumber: 'ASC' },
      });
      const matches =
        existing.citizenId === citizen.id &&
        existing.vehicleId === vehicle.id &&
        existing.status === plan.finalStatus &&
        sameTimestamp(existing.completedAt, lastCompletedAt) &&
        existing.vehicleSnapshot?.registrationNumber ===
          plan.vehicleRegistrationNumber &&
        existingInspections.length === attempts.length &&
        existingInspections.every((inspection, index) => {
          const attempt = attempts[index];
          return (
            attempt !== undefined &&
            inspection.attemptNumber === attempt.attemptNumber &&
            inspection.status === InspectionStatus.COMPLETED &&
            inspection.result === attempt.result &&
            inspection.actualStationId === attempt.stationId &&
            inspection.recordedByUserId === administratorId &&
            sameTimestamp(inspection.completedAt, attempt.completedAt) &&
            inspection.failureReason === (attempt.failureReason ?? null)
          );
        });
      if (!matches) {
        throw new Error(
          `${plan.referenceNumber} does not match the expected local historical fixture. Run the guarded local workflow reset before changing demo fixtures.`,
        );
      }
      result.historicalApplicationsUnchanged.push(plan.referenceNumber);
      continue;
    }

    const submittedAt = addUtcDays(firstCompletedAt, -7);
    const approvedAt = addUtcDays(firstCompletedAt, -1);
    const application = await applications.save(
      applications.create({
        referenceNumber: plan.referenceNumber,
        citizenId: citizen.id,
        vehicleId: vehicle.id,
        status: plan.finalStatus,
        ...historicalApplicationSnapshots(citizen, vehicle),
        currentCorrectionReason: null,
        currentRejectionReason: null,
        preferredInspectionStationId: null,
        preferredInspectionDate: null,
        submittedAt,
        reviewStartedAt: null,
        readyForInspectionAt: approvedAt,
        completedAt: lastCompletedAt,
        cancelledAt: null,
        cancelledByUserId: null,
        cancellationReason: null,
        createdAt: addUtcDays(submittedAt, -1),
        updatedAt: lastCompletedAt,
      }),
    );

    const transitions: Array<{
      previousStatus: ApplicationStatus | null;
      newStatus: ApplicationStatus;
      createdAt: Date;
      reason: string | null;
    }> = [
      {
        previousStatus: null,
        newStatus: ApplicationStatus.DRAFT,
        createdAt: addUtcDays(submittedAt, -1),
        reason: null,
      },
      {
        previousStatus: ApplicationStatus.DRAFT,
        newStatus: ApplicationStatus.SUBMITTED,
        createdAt: submittedAt,
        reason: null,
      },
      {
        previousStatus: ApplicationStatus.SUBMITTED,
        newStatus: ApplicationStatus.APPROVED,
        createdAt: approvedAt,
        reason: null,
      },
    ];
    transitions.push({
      previousStatus: ApplicationStatus.APPROVED,
      newStatus: plan.finalStatus,
      createdAt: lastCompletedAt,
      reason:
        plan.finalStatus === ApplicationStatus.INSPECTION_FAILED
          ? 'INITIAL_INSPECTION_FAILED'
          : null,
    });
    await statusHistory.save(
      transitions.map((transition) =>
        statusHistory.create({
          applicationId: application.id,
          changedByUserId: administratorId,
          ...transition,
        }),
      ),
    );
    await inspections.save(
      attempts.map((attempt) =>
        inspections.create({
          applicationId: application.id,
          appointmentId: null,
          actualStationId: attempt.stationId,
          attemptNumber: attempt.attemptNumber,
          status: InspectionStatus.COMPLETED,
          result: attempt.result,
          recordedByUserId: administratorId,
          startedAt: null,
          completedAt: attempt.completedAt,
          failureReason: attempt.failureReason ?? null,
          notes: 'Local demo historical inspection record.',
          createdAt: attempt.completedAt,
          updatedAt: attempt.completedAt,
        }),
      ),
    );
    result.historicalApplicationsCreated.push(plan.referenceNumber);
    result.historicalInspectionsCreated += attempts.length;
  }
}

async function verifySeed(
  manager: EntityManager,
  citizenId: string,
  categories: Map<VehicleClass, InspectionVehicleCategory>,
): Promise<void> {
  const vehicles = await manager.getRepository(Vehicle).find({
    where: LOCAL_DEMO_REGISTRATIONS.map((registrationNumber) => ({
      registrationNumber,
      linkedCitizenId: citizenId,
    })),
  });

  if (
    vehicles.length !== LOCAL_DEMO_VEHICLES.length ||
    vehicles.some(
      (vehicle) =>
        vehicle.vehicleClass === null ||
        vehicle.inspectionCategoryId !==
          categories.get(vehicle.vehicleClass)?.id ||
        vehicle.classificationVerifiedAt === null ||
        vehicle.classificationVerifiedBy === null,
    )
  ) {
    throw new Error('Local demo vehicle verification failed.');
  }

  const expectedReferences = LOCAL_DEMO_VEHICLES.flatMap((fixture) =>
    historicalApplicationsForVehicle(fixture).map(
      (application) => application.referenceNumber,
    ),
  );
  const historicalApplications = await manager
    .getRepository(RenewalApplication)
    .find({
      where: expectedReferences.map((referenceNumber) => ({
        referenceNumber,
        citizenId,
      })),
    });
  const historicalInspections = await manager.getRepository(Inspection).find({
    where: historicalApplications.map((application) => ({
      applicationId: application.id,
      status: InspectionStatus.COMPLETED,
    })),
  });

  const expectedInspectionCount = LOCAL_DEMO_VEHICLES.reduce(
    (count, fixture) =>
      count +
      historicalApplicationsForVehicle(fixture).reduce(
        (applicationCount, application) =>
          applicationCount + application.attempts.length,
        0,
      ),
    0,
  );
  if (
    historicalApplications.length !== expectedReferences.length ||
    historicalApplications.some(
      (application) =>
        ![
          ApplicationStatus.COMPLETED,
          ApplicationStatus.INSPECTION_FAILED,
        ].includes(application.status),
    ) ||
    historicalInspections.length !== expectedInspectionCount ||
    historicalInspections.some(
      (inspection) =>
        inspection.attemptNumber !== 1 || inspection.actualStationId === null,
    )
  ) {
    throw new Error('Local demo historical inspection verification failed.');
  }
}

async function seedFixtures(): Promise<SeedResult> {
  return dataSource().transaction(async (manager) => {
    const citizen = await resolveCitizen(manager, readCitizenSelector());
    const administratorId = await resolveAdministrator(manager);
    const anchorDate = await cambodiaToday(manager);
    const result: SeedResult = {
      vehiclesCreated: [],
      vehiclesUpdated: [],
      vehiclesUnchanged: [],
      categoriesCreated: [],
      categoriesUpdated: [],
      categoriesUnchanged: [],
      historicalApplicationsCreated: [],
      historicalApplicationsUnchanged: [],
      historicalInspectionsCreated: 0,
      anchorDate,
    };
    const categories = await ensureDemoCategories(manager, result);

    await upsertVehicles(
      manager,
      citizen,
      administratorId,
      categories,
      anchorDate,
      result,
    );
    await seedHistoricalInspections(manager, citizen, administratorId, result);
    await verifySeed(manager, citizen.id, categories);

    return result;
  });
}

async function main(): Promise<void> {
  assertLocalDevelopmentSafety();
  readCitizenSelector();
  localDataSource = loadValidatedDataSource();
  await dataSource().initialize();

  try {
    const result = await seedFixtures();
    console.log(`Fixture anchor date: ${result.anchorDate}`);
    console.log(
      `Categories created: ${result.categoriesCreated.join(', ') || 'none'}`,
    );
    console.log(
      `Categories updated: ${result.categoriesUpdated.join(', ') || 'none'}`,
    );
    console.log(
      `Categories unchanged: ${result.categoriesUnchanged.join(', ') || 'none'}`,
    );
    console.log(
      `Vehicles created: ${result.vehiclesCreated.join(', ') || 'none'}`,
    );
    console.log(
      `Vehicles updated: ${result.vehiclesUpdated.join(', ') || 'none'}`,
    );
    console.log(
      `Vehicles unchanged: ${result.vehiclesUnchanged.join(', ') || 'none'}`,
    );
    console.log(
      `Historical applications created: ${result.historicalApplicationsCreated.join(', ') || 'none'}`,
    );
    console.log(
      `Historical applications unchanged: ${result.historicalApplicationsUnchanged.join(', ') || 'none'}`,
    );
    console.log(
      `Historical inspections created: ${result.historicalInspectionsCreated}`,
    );
  } finally {
    await dataSource().destroy();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error.';
  console.error(`Local vehicle seed aborted: ${message}`);
  process.exitCode = 1;
});
