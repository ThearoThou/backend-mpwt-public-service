import { ConfigService } from '@nestjs/config';
import { DataSource, type EntityManager } from 'typeorm';

import { AuthHashingService } from './auth-hashing.service';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { UsersService } from '../users/users.service';

const PASSWORD = 'bootstrap-password';

function createConfig(
  values: Record<string, string | boolean | undefined>,
): ConfigService {
  return {
    get: jest.fn((name: string) => values[name]),
    getOrThrow: jest.fn((name: string) => {
      const value = values[name];

      if (value === undefined) {
        throw new Error(`Missing ${name}`);
      }

      return value;
    }),
  } as unknown as ConfigService;
}

function createDataSource(manager: EntityManager): DataSource {
  return {
    transaction: jest.fn(
      (callback: (transactionManager: EntityManager) => unknown) =>
        callback(manager),
    ),
  } as unknown as DataSource;
}

describe('AdminBootstrapService', () => {
  it('creates the first active administrator from normalized configuration through Argon2id hashing', async () => {
    const manager = {} as EntityManager;
    const users = {
      findInitialAdministrator: jest.fn().mockResolvedValue(null),
      hasIdentifierConflict: jest.fn().mockResolvedValue(false),
      createInitialAdministrator: jest.fn().mockResolvedValue({}),
    };
    const hashing = {
      hashSecret: jest.fn().mockResolvedValue('argon2id-hash'),
    };
    const service = new AdminBootstrapService(
      createConfig({
        ADMIN_BOOTSTRAP_ENABLED: true,
        ADMIN_BOOTSTRAP_PHONE: '012 345 678',
        ADMIN_BOOTSTRAP_EMAIL: ' Bootstrap.Admin@Example.com ',
        ADMIN_BOOTSTRAP_PASSWORD: PASSWORD,
      }),
      createDataSource(manager),
      users as unknown as UsersService,
      hashing as unknown as AuthHashingService,
    );

    await service.bootstrapInitialAdministrator();

    expect(hashing.hashSecret).toHaveBeenCalledWith(PASSWORD);
    expect(users.createInitialAdministrator).toHaveBeenCalledWith(
      {
        phone: '+85512345678',
        email: 'bootstrap.admin@example.com',
        passwordHash: 'argon2id-hash',
      },
      manager,
    );
  });

  it('is disabled by default and performs no database work', async () => {
    const transaction = jest.fn();
    const dataSource = { transaction } as unknown as DataSource;
    const service = new AdminBootstrapService(
      createConfig({ ADMIN_BOOTSTRAP_ENABLED: false }),
      dataSource,
      {} as UsersService,
      {} as AuthHashingService,
    );

    await service.bootstrapInitialAdministrator();

    expect(transaction).not.toHaveBeenCalled();
  });

  it('is idempotent and never overwrites an existing administrator password', async () => {
    const manager = {} as EntityManager;
    const users = {
      findInitialAdministrator: jest.fn().mockResolvedValue({ id: 'admin-id' }),
      hasIdentifierConflict: jest.fn(),
      createInitialAdministrator: jest.fn(),
    };
    const hashing = { hashSecret: jest.fn() };
    const service = new AdminBootstrapService(
      createConfig({
        ADMIN_BOOTSTRAP_ENABLED: true,
        ADMIN_BOOTSTRAP_EMAIL: 'admin@example.com',
        ADMIN_BOOTSTRAP_PASSWORD: PASSWORD,
      }),
      createDataSource(manager),
      users as unknown as UsersService,
      hashing as unknown as AuthHashingService,
    );

    await service.bootstrapInitialAdministrator();

    expect(users.hasIdentifierConflict).not.toHaveBeenCalled();
    expect(hashing.hashSecret).not.toHaveBeenCalled();
    expect(users.createInitialAdministrator).not.toHaveBeenCalled();
  });

  it('fails safely on identifier conflicts without exposing credentials', async () => {
    const manager = {} as EntityManager;
    const users = {
      findInitialAdministrator: jest.fn().mockResolvedValue(null),
      hasIdentifierConflict: jest.fn().mockResolvedValue(true),
      createInitialAdministrator: jest.fn(),
    };
    const service = new AdminBootstrapService(
      createConfig({
        ADMIN_BOOTSTRAP_ENABLED: true,
        ADMIN_BOOTSTRAP_EMAIL: 'admin@example.com',
        ADMIN_BOOTSTRAP_PASSWORD: PASSWORD,
      }),
      createDataSource(manager),
      users as unknown as UsersService,
      {} as AuthHashingService,
    );

    await expect(service.bootstrapInitialAdministrator()).rejects.toThrow(
      'Initial administrator bootstrap could not be completed.',
    );
    await expect(service.bootstrapInitialAdministrator()).rejects.not.toThrow(
      'admin@example.com',
    );
    expect(users.createInitialAdministrator).not.toHaveBeenCalled();
  });
});
