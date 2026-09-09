import 'dotenv/config';

import * as argon2 from 'argon2';
import { createRequire } from 'node:module';
import type { DataSource, EntityManager } from 'typeorm';

import { AUTH_ARGON2ID_OPTIONS } from '../src/auth/auth-hashing.service';
import {
  normalizeCambodianPhone,
  normalizeEmail,
} from '../src/auth/identifier-normalization';
import { CitizenProfile } from '../src/users/entities/citizen-profile.entity';
import { User } from '../src/users/entities/user.entity';
import { UserRole } from '../src/users/enums/user-role.enum';
import { UserStatus } from '../src/users/enums/user-status.enum';

const LOCAL_ENVIRONMENT = 'development';
const LOCAL_CONFIRMATION = 'true';
const requireFromScript = createRequire(__filename);

let localDataSource: DataSource | undefined;

interface LocalActorFixture {
  email: string;
  phone: string;
  role: UserRole;
  nameKh?: string;
  nameEn?: string;
  nationalIdNumber?: string;
  address?: string;
}

interface SeedResult {
  created: string[];
  updated: string[];
  unchanged: string[];
}

const LOCAL_ACTORS: readonly LocalActorFixture[] = [
  {
    email: 'demo.admin@local.test',
    phone: '010000001',
    role: UserRole.ADMIN,
  },
  {
    email: 'demo.citizen@local.test',
    phone: '012345678',
    role: UserRole.CITIZEN,
    nameKh: 'អ្នកប្រើប្រាស់សាកល្បង',
    nameEn: 'Demo Citizen',
    nationalIdNumber: 'LOCAL-DEMO-CITIZEN-001',
    address: 'Phnom Penh, Cambodia',
  },
];

function assertSafety(): string {
  if (process.env.NODE_ENV !== LOCAL_ENVIRONMENT) {
    throw new Error(
      'This seed may only run with NODE_ENV=development. No database changes were made.',
    );
  }

  if (process.env.ALLOW_LOCAL_DEMO_ACTOR_SEED !== LOCAL_CONFIRMATION) {
    throw new Error(
      'Set ALLOW_LOCAL_DEMO_ACTOR_SEED=true to explicitly allow local demo actor creation. No database changes were made.',
    );
  }

  const password = process.env.LOCAL_DEMO_PASSWORD;
  if (password === undefined || password.length < 8) {
    throw new Error(
      'Set LOCAL_DEMO_PASSWORD to a local-only password of at least 8 characters. No database changes were made.',
    );
  }

  return password;
}

function dataSource(): DataSource {
  if (localDataSource === undefined) {
    throw new Error(
      'The local demo actor data source has not been initialized.',
    );
  }

  return localDataSource;
}

function loadValidatedDataSource(): DataSource {
  return (
    requireFromScript('../src/database/data-source') as { default: DataSource }
  ).default;
}

function actorMatches(
  user: User,
  fixture: LocalActorFixture,
  phone: string,
): boolean {
  return (
    user.role === fixture.role &&
    user.status === UserStatus.ACTIVE &&
    user.email === normalizeEmail(fixture.email) &&
    user.phone === phone &&
    user.phoneVerifiedAt !== null &&
    user.emailVerifiedAt !== null
  );
}

function profileMatches(
  profile: CitizenProfile,
  fixture: LocalActorFixture,
): boolean {
  return (
    profile.nameKh === fixture.nameKh &&
    profile.nameEn === fixture.nameEn &&
    profile.nationalIdNumber === fixture.nationalIdNumber &&
    profile.address === fixture.address &&
    profile.profileImageKey === null
  );
}

async function upsertActor(
  manager: EntityManager,
  fixture: LocalActorFixture,
  password: string,
  passwordHash: string,
  result: SeedResult,
): Promise<void> {
  const users = manager.getRepository(User);
  const profiles = manager.getRepository(CitizenProfile);
  const email = normalizeEmail(fixture.email);
  const phone = normalizeCambodianPhone(fixture.phone);
  const existing = await users.findOne({
    where: { email },
    select: {
      id: true,
      role: true,
      status: true,
      email: true,
      phone: true,
      passwordHash: true,
      phoneVerifiedAt: true,
      emailVerifiedAt: true,
    },
  });
  const phoneOwner = await users.findOne({
    where: { phone },
    select: { id: true },
  });

  if (phoneOwner !== null && phoneOwner.id !== existing?.id) {
    throw new Error(
      `Local demo phone ${fixture.phone} is assigned to another user. No database changes were made.`,
    );
  }

  const now = new Date();
  const values = {
    role: fixture.role,
    status: UserStatus.ACTIVE,
    email,
    phone,
    passwordHash,
    phoneVerifiedAt: now,
    emailVerifiedAt: now,
    lastLoginAt: null,
  };
  const user =
    existing === null
      ? await users.save(users.create(values))
      : actorMatches(existing, fixture, phone) &&
          (await argon2.verify(existing.passwordHash, password))
        ? existing
        : await users.save(users.merge(existing, values));

  if (existing === null) result.created.push(email);
  else if (user === existing) result.unchanged.push(email);
  else result.updated.push(email);

  if (fixture.role !== UserRole.CITIZEN) return;

  const existingProfile = await profiles.findOneBy({ userId: user.id });
  const profileValues = {
    userId: user.id,
    nameKh: fixture.nameKh as string,
    nameEn: fixture.nameEn as string,
    nationalIdNumber: fixture.nationalIdNumber as string,
    address: fixture.address as string,
    profileImageKey: null,
  };

  if (existingProfile === null) {
    await profiles.save(profiles.create(profileValues));
    return;
  }

  if (!profileMatches(existingProfile, fixture)) {
    await profiles.save(profiles.merge(existingProfile, profileValues));
  }
}

async function main(): Promise<void> {
  const password = assertSafety();
  localDataSource = loadValidatedDataSource();
  await dataSource().initialize();

  try {
    const passwordHash = await argon2.hash(password, AUTH_ARGON2ID_OPTIONS);
    const result = await dataSource().transaction(async (manager) => {
      const seedResult: SeedResult = {
        created: [],
        updated: [],
        unchanged: [],
      };

      for (const fixture of LOCAL_ACTORS) {
        await upsertActor(manager, fixture, password, passwordHash, seedResult);
      }

      return seedResult;
    });

    console.log(
      `Local demo actors created: ${result.created.join(', ') || 'none'}`,
    );
    console.log(
      `Local demo actors updated: ${result.updated.join(', ') || 'none'}`,
    );
    console.log(
      `Local demo actors unchanged: ${result.unchanged.join(', ') || 'none'}`,
    );
  } finally {
    await dataSource().destroy();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error.';
  console.error(`Local demo actor seed aborted: ${message}`);
  process.exitCode = 1;
});
