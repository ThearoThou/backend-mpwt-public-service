import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  E2E_DATABASE_NAME,
  E2E_PRIVATE_STORAGE_ROOT,
  approvedE2eStorageRoot,
  assertApprovedE2eDatabase,
  assertApprovedE2eDatabaseConfiguration,
  cleanApprovedE2eFixtures,
} from '../../test/e2e/e2e-safety';
import { loadE2eEnvironment } from '../../test/e2e/e2e-environment';

function approvedE2eEnvironment(
  overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    PORT: '3001',
    API_PREFIX: '/api',
    FRONTEND_ORIGIN: 'http://localhost:3001',
    PRIVATE_STORAGE_ROOT: E2E_PRIVATE_STORAGE_ROOT,
    DB_HOST: '127.0.0.1',
    DB_PORT: '5433',
    DB_USERNAME: 'postgres',
    DB_PASSWORD: 'test-password',
    DB_NAME: E2E_DATABASE_NAME,
    DB_LOGGING: 'false',
    JWT_ACCESS_SECRET: 'test-access-secret',
    JWT_ACCESS_EXPIRES_IN: '30m',
    JWT_REFRESH_SECRET: 'test-refresh-secret',
    JWT_REFRESH_EXPIRES_IN: '7d',
    REFRESH_COOKIE_NAME: 'mpwt_e2e_refresh',
    REFRESH_COOKIE_SECURE: 'false',
    REFRESH_COOKIE_SAME_SITE: 'lax',
    VERIFICATION_CODE_TTL_SECONDS: '60',
    REGISTRATION_OTP_TTL_SECONDS: '120',
    PASSWORD_RESET_OTP_TTL_SECONDS: '120',
    PASSWORD_RESET_TOKEN_TTL_SECONDS: '900',
    VERIFICATION_CODE_MAX_ATTEMPTS: '5',
    EXPOSE_DEVELOPMENT_VERIFICATION_CODE: 'false',
    ADMIN_BOOTSTRAP_ENABLED: 'false',
    ...overrides,
  };
}

describe('e2e PostgreSQL safety guards', () => {
  it('accepts only the dedicated e2e database configuration', () => {
    expect(() =>
      assertApprovedE2eDatabaseConfiguration({ DB_NAME: E2E_DATABASE_NAME }),
    ).not.toThrow();
  });

  it.each(['mpwt_vehicle_inspection_renewal', 'arbitrary_database'])(
    'rejects unsafe database configuration %s',
    (databaseName) => {
      expect(() =>
        assertApprovedE2eDatabaseConfiguration({ DB_NAME: databaseName }),
      ).toThrow(E2E_DATABASE_NAME);
    },
  );

  it('rejects a connection whose current database is not approved', async () => {
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValue([
          { currentDatabase: 'mpwt_vehicle_inspection_renewal' },
        ]),
    };

    await expect(
      assertApprovedE2eDatabase(dataSource as never, {
        DB_NAME: E2E_DATABASE_NAME,
      }),
    ).rejects.toThrow(E2E_DATABASE_NAME);
  });

  it('refuses fixture cleanup before an unapproved database can be modified', async () => {
    const cleanup = jest.fn();
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValue([
          { currentDatabase: 'mpwt_vehicle_inspection_renewal' },
        ]),
      transaction: jest.fn(),
    };

    await expect(
      cleanApprovedE2eFixtures(
        dataSource as never,
        { DB_NAME: E2E_DATABASE_NAME },
        cleanup,
      ),
    ).rejects.toThrow(E2E_DATABASE_NAME);

    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('fails safely when required explicit e2e environment variables are missing', () => {
    expect(() => loadE2eEnvironment({})).toThrow(
      'Environment variable JWT_ACCESS_SECRET must be a non-empty string.',
    );
  });

  it('does not fall back to the normal .env file', () => {
    expect(() => loadE2eEnvironment({})).toThrow(
      'Environment variable JWT_ACCESS_SECRET must be a non-empty string.',
    );
  });

  it('rejects the development database name from explicit e2e environment variables', () => {
    expect(() =>
      loadE2eEnvironment(
        approvedE2eEnvironment({
          DB_NAME: 'mpwt_vehicle_inspection_renewal',
        }),
      ),
    ).toThrow(E2E_DATABASE_NAME);
  });

  it('accepts approved explicit e2e environment variables', () => {
    expect(loadE2eEnvironment(approvedE2eEnvironment())).toMatchObject({
      DB_NAME: E2E_DATABASE_NAME,
      PRIVATE_STORAGE_ROOT: E2E_PRIVATE_STORAGE_ROOT,
    });
  });

  it('configures Jest e2e execution with one worker', () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), 'test/jest-e2e.json'), 'utf8'),
    ) as { maxWorkers?: number };

    expect(config.maxWorkers).toBe(1);
  });

  it('uses a storage root distinct from normal private storage', () => {
    expect(approvedE2eStorageRoot(E2E_PRIVATE_STORAGE_ROOT)).toBe(
      resolve(process.cwd(), E2E_PRIVATE_STORAGE_ROOT),
    );
    expect(E2E_PRIVATE_STORAGE_ROOT).not.toBe('storage/private');
  });

  it('rejects unsafe storage cleanup paths before deletion', () => {
    expect(() => approvedE2eStorageRoot('storage/private')).toThrow(
      E2E_PRIVATE_STORAGE_ROOT,
    );
    expect(() => approvedE2eStorageRoot('.')).toThrow(E2E_PRIVATE_STORAGE_ROOT);
  });
});
