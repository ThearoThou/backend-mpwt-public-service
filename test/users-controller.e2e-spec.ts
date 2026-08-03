import { HttpStatus, INestApplication, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AuthTokenService } from '../src/auth/auth-token.service';
import { RefreshSessionService } from '../src/auth/refresh-session.service';
import { AccessTokenGuard } from '../src/common/auth/access-token.guard';
import { RolesGuard } from '../src/common/auth/roles.guard';
import { configureApiApplication } from '../src/common/http/api-application.configuration';
import { ApiErrorCode } from '../src/common/errors/api-error-code';
import { DomainException } from '../src/common/errors/domain.exception';
import { AdminUsersController } from '../src/users/admin-users.controller';
import { UserRole } from '../src/users/enums/user-role.enum';
import { UserStatus } from '../src/users/enums/user-status.enum';
import { User } from '../src/users/entities/user.entity';
import { UsersController } from '../src/users/users.controller';
import { UsersService } from '../src/users/users.service';

const CITIZEN_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '22222222-2222-4222-8222-222222222222';
const TARGET_ID = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2030-08-01T00:00:00.000Z');

@Module({
  controllers: [UsersController, AdminUsersController],
  providers: [
    UsersService,
    AccessTokenGuard,
    RolesGuard,
    AuthTokenService,
    RefreshSessionService,
    { provide: getRepositoryToken(User), useValue: {} },
  ],
})
class UsersControllerE2eModule {}

function citizenProfile() {
  return {
    id: '66666666-6666-4666-8666-666666666666',
    userId: CITIZEN_ID,
    nameKh: 'ពលរដ្ឋ',
    nameEn: 'Citizen Name',
    nationalIdNumber: 'NID-123',
    address: 'Phnom Penh',
    profileImageUrl: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function currentUser(role: UserRole.CITIZEN | UserRole.ADMIN) {
  return {
    user: {
      id: role === UserRole.CITIZEN ? CITIZEN_ID : ADMIN_ID,
      role,
      status: UserStatus.ACTIVE,
      phone: '+85512345678',
      email: 'user@example.com',
      phoneVerifiedAt: NOW,
      emailVerifiedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    },
    citizenProfile: role === UserRole.CITIZEN ? citizenProfile() : null,
  };
}

describe('users controllers (e2e)', () => {
  let app: INestApplication<App>;
  let usersService: jest.Mocked<
    Pick<
      UsersService,
      | 'getCurrentUser'
      | 'updateCurrentCitizenProfile'
      | 'listUsers'
      | 'getAdminUserDetail'
      | 'updateUserStatus'
    >
  >;
  let tokenService: jest.Mocked<Pick<AuthTokenService, 'verifyAccessToken'>>;
  let sessionService: jest.Mocked<
    Pick<RefreshSessionService, 'validateActiveSessionForUser'>
  >;

  beforeEach(async () => {
    usersService = {
      getCurrentUser: jest
        .fn()
        .mockResolvedValue(currentUser(UserRole.CITIZEN)),
      updateCurrentCitizenProfile: jest
        .fn()
        .mockResolvedValue(citizenProfile()),
      listUsers: jest.fn().mockResolvedValue({
        data: [currentUser(UserRole.CITIZEN).user],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      }),
      getAdminUserDetail: jest
        .fn()
        .mockResolvedValue(currentUser(UserRole.CITIZEN).user),
      updateUserStatus: jest.fn().mockResolvedValue({
        ...currentUser(UserRole.CITIZEN).user,
        id: TARGET_ID,
        status: UserStatus.DISABLED,
      }),
    };
    tokenService = {
      verifyAccessToken: jest.fn((token: string) => {
        if (token === 'citizen-token') {
          return {
            sub: CITIZEN_ID,
            role: UserRole.CITIZEN,
            sid: '44444444-4444-4444-8444-444444444444',
            typ: 'access' as const,
          };
        }

        if (token === 'admin-token') {
          return {
            sub: ADMIN_ID,
            role: UserRole.ADMIN,
            sid: '55555555-5555-4555-8555-555555555555',
            typ: 'access' as const,
          };
        }

        throw new DomainException(
          ApiErrorCode.AUTH_TOKEN_INVALID,
          HttpStatus.UNAUTHORIZED,
          'Authentication is required',
        );
      }),
    };
    sessionService = {
      validateActiveSessionForUser: jest.fn((sessionId: string) => ({
        id: sessionId,
      })),
    };
    const usersRepository = {
      findOne: jest.fn(({ where }: { where: { id: string } }) => ({
        id: where.id,
        role: where.id === ADMIN_ID ? UserRole.ADMIN : UserRole.CITIZEN,
        status: UserStatus.ACTIVE,
      })),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [UsersControllerE2eModule],
    })
      .overrideProvider(UsersService)
      .useValue(usersService)
      .overrideProvider(AuthTokenService)
      .useValue(tokenService)
      .overrideProvider(RefreshSessionService)
      .useValue(sessionService)
      .overrideProvider(getRepositoryToken(User))
      .useValue(usersRepository)
      .compile();

    app = moduleFixture.createNestApplication<App>();
    configureApiApplication(app, '/api');
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('returns safe current-user data for active citizens and administrators', async () => {
    const citizen = await request(app.getHttpServer())
      .get('/api/users/me')
      .set('Authorization', 'Bearer citizen-token')
      .expect(HttpStatus.OK);

    usersService.getCurrentUser.mockResolvedValueOnce(
      currentUser(UserRole.ADMIN),
    );
    const admin = await request(app.getHttpServer())
      .get('/api/users/me')
      .set('Authorization', 'Bearer admin-token')
      .expect(HttpStatus.OK);

    expect(
      (citizen.body as { data: Record<string, unknown> }).data,
    ).toMatchObject({
      user: { id: CITIZEN_ID },
      citizenProfile: { userId: CITIZEN_ID },
    });
    expect(citizen.body).not.toHaveProperty('data.user.lastLoginAt');
    expect(citizen.body).not.toHaveProperty('data.user.passwordHash');
    expect(citizen.body).not.toHaveProperty(
      'data.citizenProfile.profileImageKey',
    );
    expect(
      (admin.body as { data: Record<string, unknown> }).data,
    ).toMatchObject({
      user: { id: ADMIN_ID, role: UserRole.ADMIN },
      citizenProfile: null,
    });
  });

  it('rejects unauthenticated current-user and citizen-profile requests', async () => {
    const current = await request(app.getHttpServer())
      .get('/api/users/me')
      .expect(HttpStatus.UNAUTHORIZED);
    const profile = await request(app.getHttpServer())
      .patch('/api/users/me/citizen-profile')
      .send({ nameEn: 'Updated Name' })
      .expect(HttpStatus.UNAUTHORIZED);

    expect(current.body).toMatchObject({
      code: ApiErrorCode.AUTH_TOKEN_INVALID,
    });
    expect(profile.body).toMatchObject({
      code: ApiErrorCode.AUTH_TOKEN_INVALID,
    });
  });

  it('allows only citizens to patch approved profile fields and rejects unknown or protected fields', async () => {
    const success = await request(app.getHttpServer())
      .patch('/api/users/me/citizen-profile')
      .set('Authorization', 'Bearer citizen-token')
      .send({ nameEn: 'Updated Name', address: 'Updated address' })
      .expect(HttpStatus.OK);
    const unknown = await request(app.getHttpServer())
      .patch('/api/users/me/citizen-profile')
      .set('Authorization', 'Bearer citizen-token')
      .send({ profileImageKey: 'private/key' })
      .expect(HttpStatus.BAD_REQUEST);
    const protectedField = await request(app.getHttpServer())
      .patch('/api/users/me/citizen-profile')
      .set('Authorization', 'Bearer citizen-token')
      .send({ status: UserStatus.DISABLED })
      .expect(HttpStatus.BAD_REQUEST);
    const admin = await request(app.getHttpServer())
      .patch('/api/users/me/citizen-profile')
      .set('Authorization', 'Bearer admin-token')
      .send({ nameEn: 'Updated Name' })
      .expect(HttpStatus.FORBIDDEN);

    expect(usersService.updateCurrentCitizenProfile).toHaveBeenCalledWith(
      CITIZEN_ID,
      { nameEn: 'Updated Name', address: 'Updated address' },
    );
    expect(success.body).toMatchObject({
      data: { id: '66666666-6666-4666-8666-666666666666', userId: CITIZEN_ID },
    });
    expect(success.body).not.toHaveProperty('data.user');
    expect(success.body).not.toHaveProperty('data.profileImageKey');
    expect(unknown.body).toMatchObject({ code: ApiErrorCode.VALIDATION_ERROR });
    expect(protectedField.body).toMatchObject({
      code: ApiErrorCode.VALIDATION_ERROR,
    });
    expect(admin.body).toMatchObject({ code: ApiErrorCode.FORBIDDEN });
  });

  it('returns the generic approved conflict for a duplicate national ID', async () => {
    usersService.updateCurrentCitizenProfile.mockRejectedValueOnce(
      new DomainException(
        ApiErrorCode.CONFLICT,
        HttpStatus.CONFLICT,
        'Citizen profile conflicts with an existing record',
      ),
    );

    const response = await request(app.getHttpServer())
      .patch('/api/users/me/citizen-profile')
      .set('Authorization', 'Bearer citizen-token')
      .send({ nationalIdNumber: 'NID-123' })
      .expect(HttpStatus.CONFLICT);

    expect(response.body).toMatchObject({
      code: ApiErrorCode.CONFLICT,
      message: 'Citizen profile conflicts with an existing record',
    });
    expect(response.body).not.toHaveProperty('constraint');
    expect(response.body).not.toHaveProperty('detail');
  });

  it('lists users for administrators with the contract pagination and filters only', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/users')
      .set('Authorization', 'Bearer admin-token')
      .query({ role: UserRole.CITIZEN, status: UserStatus.ACTIVE })
      .expect(HttpStatus.OK);

    expect(usersService.listUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        limit: 20,
        sortOrder: 'desc',
        sortBy: 'createdAt',
        role: UserRole.CITIZEN,
        status: UserStatus.ACTIVE,
      }),
    );
    expect(response.body).toMatchObject({
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    expect(response.body).not.toHaveProperty('data.0.passwordHash');
  });

  it('rejects unauthenticated and citizen administrator-list requests', async () => {
    const unauthenticated = await request(app.getHttpServer())
      .get('/api/admin/users')
      .expect(HttpStatus.UNAUTHORIZED);
    const citizen = await request(app.getHttpServer())
      .get('/api/admin/users')
      .set('Authorization', 'Bearer citizen-token')
      .expect(HttpStatus.FORBIDDEN);

    expect(unauthenticated.body).toMatchObject({
      code: ApiErrorCode.AUTH_TOKEN_INVALID,
    });
    expect(citizen.body).toMatchObject({ code: ApiErrorCode.FORBIDDEN });
  });

  it('returns an administrator user detail as UserSummary and validates UUIDs', async () => {
    const detail = await request(app.getHttpServer())
      .get(`/api/admin/users/${TARGET_ID}`)
      .set('Authorization', 'Bearer admin-token')
      .expect(HttpStatus.OK);
    const invalid = await request(app.getHttpServer())
      .get('/api/admin/users/not-a-uuid')
      .set('Authorization', 'Bearer admin-token')
      .expect(HttpStatus.BAD_REQUEST);

    expect(detail.body).toMatchObject({
      data: { id: CITIZEN_ID },
    });
    expect(detail.body).not.toHaveProperty('data.citizenProfile');
    expect(invalid.body).toMatchObject({ code: ApiErrorCode.VALIDATION_ERROR });
  });

  it('returns approved not-found and authorization responses for administrator user detail', async () => {
    usersService.getAdminUserDetail.mockRejectedValueOnce(
      new DomainException(
        ApiErrorCode.USER_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        'User not found',
      ),
    );
    const notFound = await request(app.getHttpServer())
      .get(`/api/admin/users/${TARGET_ID}`)
      .set('Authorization', 'Bearer admin-token')
      .expect(HttpStatus.NOT_FOUND);
    const citizen = await request(app.getHttpServer())
      .get(`/api/admin/users/${TARGET_ID}`)
      .set('Authorization', 'Bearer citizen-token')
      .expect(HttpStatus.FORBIDDEN);

    expect(notFound.body).toMatchObject({ code: ApiErrorCode.USER_NOT_FOUND });
    expect(citizen.body).toMatchObject({ code: ApiErrorCode.FORBIDDEN });
  });

  it('updates a target status only for administrators and validates the allowed enum', async () => {
    await request(app.getHttpServer())
      .patch(`/api/admin/users/${TARGET_ID}/status`)
      .set('Authorization', 'Bearer admin-token')
      .send({ status: UserStatus.DISABLED })
      .expect(HttpStatus.OK);
    const invalid = await request(app.getHttpServer())
      .patch(`/api/admin/users/${TARGET_ID}/status`)
      .set('Authorization', 'Bearer admin-token')
      .send({ status: UserStatus.PENDING_VERIFICATION })
      .expect(HttpStatus.BAD_REQUEST);
    const citizen = await request(app.getHttpServer())
      .patch(`/api/admin/users/${TARGET_ID}/status`)
      .set('Authorization', 'Bearer citizen-token')
      .send({ status: UserStatus.DISABLED })
      .expect(HttpStatus.FORBIDDEN);

    expect(usersService.updateUserStatus).toHaveBeenCalledWith(
      ADMIN_ID,
      TARGET_ID,
      UserStatus.DISABLED,
    );
    expect(invalid.body).toMatchObject({ code: ApiErrorCode.VALIDATION_ERROR });
    expect(citizen.body).toMatchObject({ code: ApiErrorCode.FORBIDDEN });
  });

  it('returns the approved generic conflict for a self-status change', async () => {
    usersService.updateUserStatus.mockImplementationOnce(() => {
      throw new DomainException(
        ApiErrorCode.USER_STATUS_INVALID_TRANSITION,
        HttpStatus.CONFLICT,
        'Requested status change is not permitted',
      );
    });

    const response = await request(app.getHttpServer())
      .patch(`/api/admin/users/${ADMIN_ID}/status`)
      .set('Authorization', 'Bearer admin-token')
      .send({ status: UserStatus.DISABLED })
      .expect(HttpStatus.CONFLICT);

    expect(response.body).toMatchObject({
      code: ApiErrorCode.USER_STATUS_INVALID_TRANSITION,
      message: 'Requested status change is not permitted',
    });
  });
});
