import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { AppModule } from './app.module';
import { AuthSecurityModule } from './auth/auth-security.module';
import { AuthSessionPersistenceModule } from './auth/auth-session-persistence.module';
import { AuthTokenService } from './auth/auth-token.service';
import { RefreshSessionService } from './auth/refresh-session.service';
import { AccessTokenGuard } from './common/auth/access-token.guard';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { AdminUsersController } from './users/admin-users.controller';
import { UsersController } from './users/users.controller';
import { UsersModule } from './users/users.module';

const testConfig = {
  API_PREFIX: '/api',
  JWT_ACCESS_SECRET: 'test-access-secret',
  JWT_ACCESS_EXPIRES_IN: '30m',
  JWT_REFRESH_SECRET: 'test-refresh-secret',
  JWT_REFRESH_EXPIRES_IN: '7d',
  REFRESH_COOKIE_NAME: 'mpwt_refresh',
  REFRESH_COOKIE_SECURE: false,
  REFRESH_COOKIE_SAME_SITE: 'lax',
  ADMIN_BOOTSTRAP_ENABLED: false,
};

const testConfigService = {
  get: jest.fn((name: keyof typeof testConfig) => testConfig[name]),
  getOrThrow: jest.fn((name: keyof typeof testConfig) => testConfig[name]),
};

const testDataSource = {
  entityMetadatas: [],
  options: { type: 'postgres' },
  getRepository: jest.fn(),
  transaction: jest.fn(),
};

@Global()
@Module({
  providers: [{ provide: ConfigService, useValue: testConfigService }],
  exports: [ConfigService],
})
class TestConfigModule {}

@Global()
@Module({
  providers: [{ provide: DataSource, useValue: testDataSource }],
  exports: [DataSource],
})
class TestDatabaseModule {}

describe('AppModule runtime module graph', () => {
  it('resolves the users guards from the shared authentication infrastructure', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideModule(ConfigModule)
      .useModule(TestConfigModule)
      .overrideModule(DatabaseModule)
      .useModule(TestDatabaseModule)
      .compile();

    try {
      const guard = moduleRef.get(AccessTokenGuard);
      const tokenService = moduleRef.get(AuthTokenService);
      const sessionService = moduleRef.get(RefreshSessionService);

      expect(
        moduleRef.select(UsersModule).get(UsersController, { strict: true }),
      ).toBeInstanceOf(UsersController);
      expect(
        moduleRef
          .select(UsersModule)
          .get(AdminUsersController, { strict: true }),
      ).toBeInstanceOf(AdminUsersController);
      expect(guard).toBeInstanceOf(AccessTokenGuard);
      expect(
        moduleRef
          .select(AuthSecurityModule)
          .get(AuthTokenService, { strict: true }),
      ).toBe(tokenService);
      expect(
        moduleRef
          .select(AuthSessionPersistenceModule)
          .get(RefreshSessionService, { strict: true }),
      ).toBe(sessionService);
    } finally {
      await moduleRef.close();
    }
  });
});
