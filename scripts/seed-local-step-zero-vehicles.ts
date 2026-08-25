import { createRequire } from 'node:module';
import type { DataSource, EntityManager } from 'typeorm';

import {
  normalizeCambodianPhone,
  normalizeEmail,
} from '../src/auth/identifier-normalization';
import { InspectionVehicleCategory } from '../src/inspection-categories/entities/inspection-vehicle-category.entity';
import { CitizenProfile } from '../src/users/entities/citizen-profile.entity';
import { User } from '../src/users/entities/user.entity';
import { UserRole } from '../src/users/enums/user-role.enum';
import { UserStatus } from '../src/users/enums/user-status.enum';
import { CAMBODIAN_CAPITAL_PROVINCES_KH } from '../src/vehicles/cambodian-capital-provinces';
import { Vehicle } from '../src/vehicles/entities/vehicle.entity';
import { VehiclePlateCategory } from '../src/vehicles/enums/vehicle-plate-category.enum';

const LOCAL_SEED_ENVIRONMENT = 'development';
const LOCAL_SEED_CONFIRMATION = 'true';

let localDataSource: DataSource | undefined;
const requireFromScript = createRequire(__filename);

interface SeedCitizen {
  id: string;
  email: string;
  profile: CitizenProfile;
  phone: string;
}

interface SeedAdministrator {
  id: string;
}

interface VehicleFixture {
  registrationNumber: string;
  plateCategory: VehiclePlateCategory;
  plateProvince: string | null;
  plateNumber: string;
  plateType: string;
  vehicleType: string;
  chassisNumber: string;
  firstRegistrationDate: string;
  lastInspectionDate: string | null;
  inspectionExpiryDate: string;
  make: string;
  model: string;
  manufactureYear: number;
  owner: SeedCitizen;
}

interface SeedResult {
  primaryCitizen: string;
  otherCitizen: string;
  created: string[];
  skipped: string[];
}

function readRequiredArgument(name: string): string {
  const prefix = `--${name}=`;
  const value = process.argv
    .slice(2)
    .find((argument) => argument.startsWith(prefix));

  if (value === undefined || value.slice(prefix.length).trim().length === 0) {
    throw new Error(`Missing required argument: ${prefix}<email>`);
  }

  return value.slice(prefix.length);
}

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

function dataSource(): DataSource {
  if (localDataSource === undefined) {
    throw new Error('The local seed data source has not been initialized.');
  }

  return localDataSource;
}

function loadValidatedDataSource(): DataSource {
  const sourceModule = requireFromScript('../src/database/data-source') as {
    default: DataSource;
  };

  return sourceModule.default;
}

async function resolveCitizen(
  manager: EntityManager,
  suppliedEmail: string,
): Promise<SeedCitizen> {
  const email = normalizeEmail(suppliedEmail);
  const matches = await manager.getRepository(User).find({
    where: { email },
    relations: { citizenProfile: true },
  });

  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one user for ${email}, but found ${matches.length}.`,
    );
  }

  const user = matches[0];

  if (user.role !== UserRole.CITIZEN) {
    throw new Error(`User ${email} must have the CITIZEN role.`);
  }

  if (user.status !== UserStatus.ACTIVE) {
    throw new Error(`Citizen ${email} must be ACTIVE.`);
  }

  if (user.citizenProfile === null) {
    throw new Error(`Citizen ${email} must have a citizen profile.`);
  }

  if (user.phone === null) {
    throw new Error(
      `Citizen ${email} must have a Cambodian phone number for vehicle ownership data.`,
    );
  }

  return {
    id: user.id,
    email,
    profile: user.citizenProfile,
    phone: normalizeCambodianPhone(user.phone),
  };
}

async function resolveClassificationAdministrator(
  manager: EntityManager,
): Promise<SeedAdministrator> {
  const administrators = await manager.getRepository(User).find({
    where: {
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    },
    select: { id: true },
  });

  if (administrators.length !== 1) {
    throw new Error(
      `Expected exactly one ACTIVE ADMIN user for fixture classification, but found ${administrators.length}. No database changes were made.`,
    );
  }

  return administrators[0];
}

async function resolveActiveInspectionCategory(
  manager: EntityManager,
): Promise<InspectionVehicleCategory> {
  const category = await manager
    .getRepository(InspectionVehicleCategory)
    .findOne({ where: { isActive: true }, order: { createdAt: 'ASC' } });

  if (category === null) {
    throw new Error(
      'No ACTIVE inspection vehicle category exists. Seed catalog data before running this local vehicle seed.',
    );
  }

  return category;
}

function provinceAt(index: number, label: string): string {
  const province = CAMBODIAN_CAPITAL_PROVINCES_KH[index];

  if (province === undefined) {
    throw new Error(`The ${label} province reference value is unavailable.`);
  }

  return province;
}

function createFixtures(
  primaryCitizen: SeedCitizen,
  otherCitizen: SeedCitizen,
): VehicleFixture[] {
  const phnomPenh = provinceAt(0, 'Phnom Penh');
  const battambang = provinceAt(2, 'Battambang');
  const kampongCham = provinceAt(3, 'Kampong Cham');
  const kandal = provinceAt(8, 'Kandal');
  const siemReap = provinceAt(20, 'Siem Reap');
  const takeo = provinceAt(23, 'Takeo');

  return [
    {
      registrationNumber: 'DEV-S0-REG-001',
      plateCategory: VehiclePlateCategory.PROVINCE,
      plateProvince: phnomPenh,
      plateNumber: '2AA-1001',
      plateType: 'PRIVATE',
      vehicleType: 'PASSENGER_CAR',
      chassisNumber: 'DEV-S0-CH-001',
      firstRegistrationDate: '2017-01-15',
      lastInspectionDate: '2024-12-15',
      inspectionExpiryDate: '2025-12-15',
      make: 'Toyota',
      model: 'Prius',
      manufactureYear: 2015,
      owner: primaryCitizen,
    },
    {
      registrationNumber: 'DEV-S0-REG-002',
      plateCategory: VehiclePlateCategory.PROVINCE,
      plateProvince: phnomPenh,
      plateNumber: '2AA-1002',
      plateType: 'PRIVATE',
      vehicleType: 'PASSENGER_CAR',
      chassisNumber: 'DEV-S0-CH-002',
      firstRegistrationDate: '2018-03-20',
      lastInspectionDate: '2025-01-15',
      inspectionExpiryDate: '2026-01-15',
      make: 'Honda',
      model: 'Civic',
      manufactureYear: 2018,
      owner: primaryCitizen,
    },
    {
      registrationNumber: 'DEV-S0-REG-003',
      plateCategory: VehiclePlateCategory.PROVINCE,
      plateProvince: siemReap,
      plateNumber: '2AA-1001',
      plateType: 'PRIVATE',
      vehicleType: 'PICKUP',
      chassisNumber: 'DEV-S0-CH-003',
      firstRegistrationDate: '2019-06-10',
      lastInspectionDate: '2025-03-01',
      inspectionExpiryDate: '2026-03-01',
      make: 'Ford',
      model: 'Ranger',
      manufactureYear: 2019,
      owner: primaryCitizen,
    },
    {
      registrationNumber: 'DEV-S0-REG-004',
      plateCategory: VehiclePlateCategory.PROVINCE,
      plateProvince: battambang,
      plateNumber: '2BB-2001',
      plateType: 'PRIVATE',
      vehicleType: 'SUV',
      chassisNumber: 'DEV-S0-CH-004',
      firstRegistrationDate: '2020-02-29',
      lastInspectionDate: '2025-06-30',
      inspectionExpiryDate: '2026-06-30',
      make: 'Lexus',
      model: 'RX',
      manufactureYear: 2020,
      owner: primaryCitizen,
    },
    {
      registrationNumber: 'DEV-S0-REG-005',
      plateCategory: VehiclePlateCategory.PROVINCE,
      plateProvince: kampongCham,
      plateNumber: '2BB-2002',
      plateType: 'PRIVATE',
      vehicleType: 'SUV',
      chassisNumber: 'DEV-S0-CH-005',
      firstRegistrationDate: '2021-08-12',
      lastInspectionDate: '2025-08-01',
      inspectionExpiryDate: '2026-08-01',
      make: 'Hyundai',
      model: 'Tucson',
      manufactureYear: 2021,
      owner: primaryCitizen,
    },
    {
      registrationNumber: 'DEV-S0-REG-006',
      plateCategory: VehiclePlateCategory.PROVINCE,
      plateProvince: kandal,
      plateNumber: '2CC-3001',
      plateType: 'PRIVATE',
      vehicleType: 'PICKUP',
      chassisNumber: 'DEV-S0-CH-006',
      firstRegistrationDate: '2022-11-05',
      lastInspectionDate: '2025-08-20',
      inspectionExpiryDate: '2026-08-20',
      make: 'Isuzu',
      model: 'D-Max',
      manufactureYear: 2022,
      owner: primaryCitizen,
    },
    {
      registrationNumber: 'DEV-S0-REG-007',
      plateCategory: VehiclePlateCategory.PERSONALIZED_CAMBODIA,
      plateProvince: null,
      plateNumber: 'DEV-ONE',
      plateType: 'PERSONALIZED',
      vehicleType: 'PASSENGER_CAR',
      chassisNumber: 'DEV-S0-CH-007',
      firstRegistrationDate: '2023-04-18',
      lastInspectionDate: '2025-08-30',
      inspectionExpiryDate: '2026-08-30',
      make: 'Tesla',
      model: 'Model 3',
      manufactureYear: 2023,
      owner: primaryCitizen,
    },
    {
      registrationNumber: 'DEV-S0-REG-008',
      plateCategory: VehiclePlateCategory.PERSONALIZED_CAMBODIA,
      plateProvince: null,
      plateNumber: 'DEV-TWO',
      plateType: 'PERSONALIZED',
      vehicleType: 'VAN',
      chassisNumber: 'DEV-S0-CH-008',
      firstRegistrationDate: '2024-01-31',
      lastInspectionDate: null,
      inspectionExpiryDate: '2026-09-15',
      make: 'Kia',
      model: 'Carnival',
      manufactureYear: 2024,
      owner: primaryCitizen,
    },
    {
      registrationNumber: 'DEV-S0-REG-009',
      plateCategory: VehiclePlateCategory.PROVINCE,
      plateProvince: takeo,
      plateNumber: '2DD-4001',
      plateType: 'PRIVATE',
      vehicleType: 'PICKUP',
      chassisNumber: 'DEV-S0-CH-009',
      firstRegistrationDate: '2016-09-09',
      lastInspectionDate: '2026-07-15',
      inspectionExpiryDate: '2030-01-15',
      make: 'Toyota',
      model: 'Hilux',
      manufactureYear: 2016,
      owner: primaryCitizen,
    },
    {
      registrationNumber: 'DEV-S0-REG-010',
      plateCategory: VehiclePlateCategory.PROVINCE,
      plateProvince: phnomPenh,
      plateNumber: '2EE-5001',
      plateType: 'PRIVATE',
      vehicleType: 'SUV',
      chassisNumber: 'DEV-S0-CH-010',
      firstRegistrationDate: '2020-12-01',
      lastInspectionDate: '2026-07-20',
      inspectionExpiryDate: '2030-06-01',
      make: 'Mazda',
      model: 'CX-5',
      manufactureYear: 2020,
      owner: otherCitizen,
    },
  ];
}

function existingFixtureMatches(
  existing: Vehicle,
  fixture: VehicleFixture,
  category: InspectionVehicleCategory,
  classificationAdministrator: SeedAdministrator,
): boolean {
  return (
    existing.linkedCitizenId === fixture.owner.id &&
    existing.plateCategory === fixture.plateCategory &&
    existing.plateProvince === fixture.plateProvince &&
    existing.plateNumber === fixture.plateNumber &&
    existing.plateType === fixture.plateType &&
    existing.vehicleType === fixture.vehicleType &&
    existing.vehicleClass === category.vehicleClass &&
    existing.inspectionCategoryId === category.id &&
    existing.classificationVerifiedAt !== null &&
    existing.classificationVerifiedBy === classificationAdministrator.id &&
    existing.make === fixture.make &&
    existing.model === fixture.model &&
    existing.manufactureYear === fixture.manufactureYear &&
    existing.chassisNumber === fixture.chassisNumber &&
    existing.firstRegistrationDate === fixture.firstRegistrationDate &&
    existing.lastInspectionDate === fixture.lastInspectionDate &&
    existing.inspectionExpiryDate === fixture.inspectionExpiryDate &&
    existing.registeredOwnerNameKh === fixture.owner.profile.nameKh &&
    existing.registeredOwnerNameEn === fixture.owner.profile.nameEn &&
    existing.registeredOwnerPhone === fixture.owner.phone &&
    existing.isActive
  );
}

async function assertNoVehicleIdentityConflict(
  manager: EntityManager,
  fixture: VehicleFixture,
): Promise<void> {
  const vehicles = manager.getRepository(Vehicle);

  if (await vehicles.existsBy({ chassisNumber: fixture.chassisNumber })) {
    throw new Error(
      `${fixture.registrationNumber} conflicts with an existing chassis number.`,
    );
  }

  const plateConflict =
    fixture.plateCategory === VehiclePlateCategory.PROVINCE
      ? await vehicles.existsBy({
          plateCategory: fixture.plateCategory,
          plateProvince: fixture.plateProvince ?? '',
          plateNumber: fixture.plateNumber,
        })
      : await vehicles.existsBy({
          plateCategory: fixture.plateCategory,
          plateNumber: fixture.plateNumber,
        });

  if (plateConflict) {
    throw new Error(
      `${fixture.registrationNumber} conflicts with an existing plate identity.`,
    );
  }
}

async function seedFixtures(): Promise<SeedResult> {
  return dataSource().transaction(async (manager) => {
    const primaryCitizen = await resolveCitizen(
      manager,
      readRequiredArgument('citizen-email'),
    );
    const otherCitizen = await resolveCitizen(
      manager,
      readRequiredArgument('other-citizen-email'),
    );

    if (primaryCitizen.id === otherCitizen.id) {
      throw new Error('Primary and other citizens must be different users.');
    }

    const classificationAdministrator =
      await resolveClassificationAdministrator(manager);
    const category = await resolveActiveInspectionCategory(manager);
    const classificationVerifiedAt = new Date();

    const result: SeedResult = {
      primaryCitizen: primaryCitizen.email,
      otherCitizen: otherCitizen.email,
      created: [],
      skipped: [],
    };
    const vehicles = manager.getRepository(Vehicle);

    for (const fixture of createFixtures(primaryCitizen, otherCitizen)) {
      const existing = await vehicles.findOneBy({
        registrationNumber: fixture.registrationNumber,
      });

      if (existing !== null) {
        if (
          !existingFixtureMatches(
            existing,
            fixture,
            category,
            classificationAdministrator,
          )
        ) {
          throw new Error(
            `${fixture.registrationNumber} exists but does not match the expected local fixture. It was not modified.`,
          );
        }

        result.skipped.push(fixture.registrationNumber);
        continue;
      }

      await assertNoVehicleIdentityConflict(manager, fixture);

      await vehicles.save(
        vehicles.create({
          linkedCitizenId: fixture.owner.id,
          registrationNumber: fixture.registrationNumber,
          plateNumber: fixture.plateNumber,
          plateCategory: fixture.plateCategory,
          plateProvince: fixture.plateProvince,
          plateType: fixture.plateType,
          vehicleType: fixture.vehicleType,
          vehicleClass: category.vehicleClass,
          inspectionCategoryId: category.id,
          classificationVerifiedAt,
          classificationVerifiedBy: classificationAdministrator.id,
          make: fixture.make,
          model: fixture.model,
          manufactureYear: fixture.manufactureYear,
          chassisNumber: fixture.chassisNumber,
          firstRegistrationDate: fixture.firstRegistrationDate,
          lastInspectionDate: fixture.lastInspectionDate,
          inspectionExpiryDate: fixture.inspectionExpiryDate,
          registeredOwnerNameKh: fixture.owner.profile.nameKh,
          registeredOwnerNameEn: fixture.owner.profile.nameEn,
          registeredOwnerPhone: fixture.owner.phone,
          isActive: true,
        }),
      );

      result.created.push(fixture.registrationNumber);
    }

    return result;
  });
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function databaseNameFromQuery(value: unknown): string {
  if (!isUnknownArray(value) || value.length === 0) {
    return 'unknown';
  }

  const firstRow = value[0];

  if (typeof firstRow !== 'object' || firstRow === null) {
    return 'unknown';
  }

  const candidate = firstRow as { database_name?: unknown };

  return typeof candidate.database_name === 'string'
    ? candidate.database_name
    : 'unknown';
}

async function readCurrentDatabaseName(): Promise<string> {
  return databaseNameFromQuery(
    await dataSource().query('SELECT current_database() AS database_name'),
  );
}

async function main(): Promise<void> {
  assertLocalDevelopmentSafety();
  readRequiredArgument('citizen-email');
  readRequiredArgument('other-citizen-email');

  localDataSource = loadValidatedDataSource();
  await dataSource().initialize();

  try {
    const databaseName = await readCurrentDatabaseName();
    const configuredHost = process.env.DB_HOST ?? 'unknown';

    console.log(`Database: ${databaseName}`);
    console.log(`Configured host: ${configuredHost}`);
    console.log(
      'About to insert local development Step Zero vehicle fixtures.',
    );

    const result = await seedFixtures();

    console.log(`Primary citizen: ${result.primaryCitizen}`);
    console.log(`Other citizen: ${result.otherCitizen}`);
    result.created.forEach((registrationNumber) => {
      console.log(`CREATED ${registrationNumber}`);
    });
    result.skipped.forEach((registrationNumber) => {
      console.log(`SKIPPED ${registrationNumber}`);
    });
    console.log(`Created: ${result.created.length}`);
    console.log(`Skipped: ${result.skipped.length}`);
  } finally {
    await dataSource().destroy();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error.';

  console.error(`Local vehicle seed aborted: ${message}`);
  process.exitCode = 1;
});
