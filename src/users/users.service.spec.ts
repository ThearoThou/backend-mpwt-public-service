import { DataSource, type EntityManager, type Repository } from 'typeorm';

import { AuditLog } from '../activity/entities/audit-log.entity';
import {
  RefreshSessionRevocationReason,
  RefreshSessionService,
} from '../auth/refresh-session.service';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { CitizenProfile } from './entities/citizen-profile.entity';
import { User } from './entities/user.entity';
import { UserRole } from './enums/user-role.enum';
import { UserStatus } from './enums/user-status.enum';
import { UsersService } from './users.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2030-08-01T00:00:00.000Z');

function createUser(overrides: Partial<User> = {}): User {
  return {
    id: USER_ID,
    role: UserRole.CITIZEN,
    status: UserStatus.ACTIVE,
    phone: '+85512345678',
    email: 'citizen@example.com',
    passwordHash: 'never-selected',
    phoneVerifiedAt: NOW,
    emailVerifiedAt: NOW,
    lastLoginAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    citizenProfile: null,
    verificationCodes: [],
    refreshSessions: [],
    vehicles: [],
    renewalApplications: [],
    cancelledRenewalApplications: [],
    uploadedApplicationDocuments: [],
    reviewedApplicationDocuments: [],
    cancelledAppointments: [],
    noShowMarkedAppointments: [],
    confirmedPayments: [],
    rejectedPayments: [],
    recordedInspections: [],
    issuedStickers: [],
    receivedNotifications: [],
    createdNotifications: [],
    actedTimelineEvents: [],
    auditLogs: [],
    ...overrides,
  };
}

function createCitizenProfile(
  overrides: Partial<CitizenProfile> = {},
): CitizenProfile {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    userId: USER_ID,
    nameKh: 'ពលរដ្ឋ',
    nameEn: 'Citizen Name',
    nationalIdNumber: 'NID-123',
    address: 'Phnom Penh',
    profileImageKey: 'private/profile-image.png',
    createdAt: NOW,
    updatedAt: NOW,
    user: createUser(),
    ...overrides,
  };
}

function createService(
  users: Partial<Repository<User>> = {},
  profiles: Partial<Repository<CitizenProfile>> = {},
  dataSource: Partial<DataSource> = {},
  sessions: Partial<RefreshSessionService> = {},
): UsersService {
  return new UsersService(
    users as Repository<User>,
    profiles as Repository<CitizenProfile>,
    dataSource as DataSource,
    sessions as RefreshSessionService,
  );
}

describe('UsersService', () => {
  it('loads the login user through the transaction manager with a pessimistic write lock', async () => {
    const loginRepository = { findOne: jest.fn().mockResolvedValue(null) };
    const manager = {
      getRepository: jest.fn(() => loginRepository),
    };
    const service = createService();

    await service.findUserForLogin('citizen@example.com', manager as never);

    expect(manager.getRepository).toHaveBeenCalledWith(User);
    expect(loginRepository.findOne).toHaveBeenCalledWith({
      where: { email: 'citizen@example.com' },
      lock: { mode: 'pessimistic_write' },
      select: {
        id: true,
        role: true,
        status: true,
        phone: true,
        email: true,
        phoneVerifiedAt: true,
        emailVerifiedAt: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        passwordHash: true,
      },
    });
  });

  it('maps the current citizen and profile without private credential or storage fields', async () => {
    const user = createUser();
    const profile = createCitizenProfile();
    const users = { findOne: jest.fn().mockResolvedValue(user) };
    const profiles = { findOne: jest.fn().mockResolvedValue(profile) };
    const service = createService(users, profiles);

    const response = await service.getCurrentUser(USER_ID);

    expect(response).toMatchObject({
      user: { id: USER_ID },
      citizenProfile: { id: profile.id, profileImageUrl: null },
    });
    expect(users.findOne).toHaveBeenCalledWith({
      where: { id: USER_ID },
      select: {
        id: true,
        role: true,
        status: true,
        phone: true,
        email: true,
        phoneVerifiedAt: true,
        emailVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    expect(response).not.toHaveProperty('user.lastLoginAt');
    expect(response).not.toHaveProperty('user.passwordHash');
    expect(response).not.toHaveProperty('citizenProfile.profileImageKey');
  });

  it('updates only supplied approved citizen-profile fields atomically and returns the profile directly', async () => {
    const profile = createCitizenProfile();
    const profiles = {
      findOne: jest.fn().mockResolvedValue(profile),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const service = createService({}, profiles);

    const response = await service.updateCurrentCitizenProfile(USER_ID, {
      nameEn: 'Updated Name',
      address: 'Updated address',
    });

    expect(profiles.update).toHaveBeenCalledWith(
      { userId: USER_ID },
      { nameEn: 'Updated Name', address: 'Updated address' },
    );
    expect(response).toMatchObject({
      id: profile.id,
      userId: USER_ID,
      nameEn: profile.nameEn,
      profileImageUrl: null,
    });
    expect(response).not.toHaveProperty('user');
    expect(response).not.toHaveProperty('profileImageKey');
  });

  it('persists a cleared optional English name as null', async () => {
    const profile = createCitizenProfile({ nameEn: null });
    const profiles = {
      findOne: jest.fn().mockResolvedValue(profile),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const service = createService({}, profiles);

    await service.updateCurrentCitizenProfile(USER_ID, { nameEn: null });

    expect(profiles.update).toHaveBeenCalledWith(
      { userId: USER_ID },
      { nameEn: null },
    );
  });

  it('returns the existing safe profile without a write when no editable fields are supplied', async () => {
    const profile = createCitizenProfile();
    const profiles = {
      findOne: jest.fn().mockResolvedValue(profile),
      update: jest.fn(),
    };
    const service = createService({}, profiles);

    const response = await service.updateCurrentCitizenProfile(USER_ID, {});

    expect(profiles.update).not.toHaveBeenCalled();
    expect(response).toMatchObject({ id: profile.id, userId: USER_ID });
  });

  it('returns USER_NOT_FOUND when the atomic profile update affects no row', async () => {
    const profiles = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    const service = createService({}, profiles);

    await expect(
      service.updateCurrentCitizenProfile(USER_ID, { nameKh: 'ថ្មី' }),
    ).rejects.toMatchObject({ code: ApiErrorCode.USER_NOT_FOUND });
    expect(profiles.findOne).not.toHaveBeenCalled();
  });

  it('maps only duplicate national-ID writes to the generic profile conflict', async () => {
    const profiles = {
      update: jest.fn().mockRejectedValue({
        code: '23505',
        constraint: 'UQ_aa30876112d7d4c1ab2d9e7c6c9',
        detail: 'duplicate national ID',
      }),
    };
    const service = createService({}, profiles);

    await expect(
      service.updateCurrentCitizenProfile(USER_ID, {
        nationalIdNumber: 'NID-123',
      }),
    ).rejects.toMatchObject({
      code: ApiErrorCode.CONFLICT,
      status: 409,
      safeMessage: 'Citizen profile conflicts with an existing record',
    });
  });

  it('rethrows unrelated profile-update failures for the global sanitized handler', async () => {
    const databaseError = new Error('database connection lost');
    const profiles = {
      update: jest.fn().mockRejectedValue(databaseError),
    };
    const service = createService({}, profiles);

    await expect(
      service.updateCurrentCitizenProfile(USER_ID, { address: 'Phnom Penh' }),
    ).rejects.toBe(databaseError);
  });

  it('returns an administrator user detail as UserSummary without querying citizen profiles', async () => {
    const user = createUser();
    const users = { findOne: jest.fn().mockResolvedValue(user) };
    const profiles = { findOne: jest.fn() };
    const service = createService(users, profiles);

    const response = await service.getAdminUserDetail(USER_ID);

    expect(response).toMatchObject({ id: USER_ID, role: UserRole.CITIZEN });
    expect(response).not.toHaveProperty('citizenProfile');
    expect(response).not.toHaveProperty('lastLoginAt');
    expect(profiles.findOne).not.toHaveBeenCalled();
  });

  it('lists users through one selected query with approved filters, sorting, and pagination', async () => {
    const query = {
      select: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[createUser()], 1]),
    };
    const users = { createQueryBuilder: jest.fn(() => query) };
    const service = createService(users);

    const result = await service.listUsers({
      page: 2,
      limit: 10,
      sortOrder: 'asc',
      sortBy: 'updatedAt',
      role: UserRole.CITIZEN,
      status: UserStatus.ACTIVE,
      email: 'citizen@example.com',
      createdFrom: '2030-07-01T00:00:00.000Z',
      createdTo: '2030-08-01T00:00:00.000Z',
    });

    expect(query.select).toHaveBeenCalledWith([
      'user.id',
      'user.phone',
      'user.email',
      'user.role',
      'user.status',
      'user.phoneVerifiedAt',
      'user.emailVerifiedAt',
      'user.createdAt',
      'user.updatedAt',
    ]);
    expect(query.andWhere).toHaveBeenCalledWith('user.role = :role', {
      role: UserRole.CITIZEN,
    });
    expect(query.andWhere).toHaveBeenCalledWith('user.status = :status', {
      status: UserStatus.ACTIVE,
    });
    expect(query.orderBy).toHaveBeenCalledWith('user.updatedAt', 'ASC');
    expect(query.skip).toHaveBeenCalledWith(10);
    expect(query.take).toHaveBeenCalledWith(10);
    expect(result.meta).toEqual({
      page: 2,
      limit: 10,
      total: 1,
      totalPages: 1,
    });
  });

  it('rejects an inverted created-date range as validation input', async () => {
    const service = createService();

    await expect(
      service.listUsers({
        page: 1,
        limit: 20,
        sortOrder: 'desc',
        sortBy: 'createdAt',
        createdFrom: '2030-08-02T00:00:00.000Z',
        createdTo: '2030-08-01T00:00:00.000Z',
      }),
    ).rejects.toMatchObject({ code: ApiErrorCode.VALIDATION_ERROR });
  });

  it('locks the target user, revokes locked sessions, and audits an active-to-disabled transition in one transaction', async () => {
    const targetUser = createUser();
    const userRepository = {
      findOne: jest.fn().mockResolvedValue(targetUser),
      save: jest.fn().mockResolvedValue(targetUser),
    };
    const auditRepository = {
      create: jest.fn((value: Partial<AuditLog>) => value),
      save: jest.fn(),
    };
    const manager = {
      getRepository: jest.fn((entity) =>
        entity === User ? userRepository : auditRepository,
      ),
    };
    const dataSource = {
      transaction: jest.fn(
        (callback: (transactionManager: EntityManager) => unknown) =>
          callback(manager as EntityManager),
      ),
    };
    const sessions = {
      revokeAllActiveSessionsLocked: jest.fn().mockResolvedValue(2),
    };
    const service = createService({}, {}, dataSource, sessions);

    const response = await service.updateUserStatus(
      ADMIN_ID,
      USER_ID,
      UserStatus.DISABLED,
    );

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(userRepository.findOne).toHaveBeenCalledWith({
      where: { id: USER_ID },
      lock: { mode: 'pessimistic_write' },
      select: {
        id: true,
        role: true,
        status: true,
        phone: true,
        email: true,
        phoneVerifiedAt: true,
        emailVerifiedAt: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    expect(sessions.revokeAllActiveSessionsLocked).toHaveBeenCalledWith(
      USER_ID,
      RefreshSessionRevocationReason.ACCOUNT_DISABLED,
      manager,
    );
    expect(auditRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: ADMIN_ID,
        action: 'USER_STATUS_UPDATED',
        oldValues: { status: UserStatus.ACTIVE },
        newValues: { status: UserStatus.DISABLED },
      }),
    );
    expect(response.status).toBe(UserStatus.DISABLED);
  });

  it('does not revoke sessions when another administrator re-enables a disabled user', async () => {
    const targetUser = createUser({ status: UserStatus.DISABLED });
    const userRepository = {
      findOne: jest.fn().mockResolvedValue(targetUser),
      save: jest.fn().mockResolvedValue(targetUser),
    };
    const auditRepository = {
      create: jest.fn((value: Partial<AuditLog>) => value),
      save: jest.fn(),
    };
    const manager = {
      getRepository: jest.fn((entity) =>
        entity === User ? userRepository : auditRepository,
      ),
    };
    const dataSource = {
      transaction: jest.fn(
        (callback: (transactionManager: EntityManager) => unknown) =>
          callback(manager as EntityManager),
      ),
    };
    const sessions = { revokeAllActiveSessionsLocked: jest.fn() };
    const service = createService({}, {}, dataSource, sessions);

    await service.updateUserStatus(ADMIN_ID, USER_ID, UserStatus.ACTIVE);

    expect(sessions.revokeAllActiveSessionsLocked).not.toHaveBeenCalled();
  });

  it('rejects self-status changes before a transaction, update, or revocation', async () => {
    const dataSource = { transaction: jest.fn() };
    const sessions = { revokeAllActiveSessionsLocked: jest.fn() };
    const service = createService({}, {}, dataSource, sessions);

    await expect(
      service.updateUserStatus(USER_ID, USER_ID, UserStatus.DISABLED),
    ).rejects.toMatchObject({
      code: ApiErrorCode.USER_STATUS_INVALID_TRANSITION,
      status: 409,
    });
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(sessions.revokeAllActiveSessionsLocked).not.toHaveBeenCalled();
  });

  it('rejects unknown users, pending users, and already-disabled transitions', async () => {
    const userRepository = { findOne: jest.fn() };
    const manager = { getRepository: jest.fn(() => userRepository) };
    const dataSource = {
      transaction: jest.fn(
        (callback: (transactionManager: EntityManager) => unknown) =>
          callback(manager as EntityManager),
      ),
    };
    const service = createService({}, {}, dataSource);

    userRepository.findOne.mockResolvedValueOnce(null);
    await expect(
      service.updateUserStatus(ADMIN_ID, USER_ID, UserStatus.DISABLED),
    ).rejects.toMatchObject({ code: ApiErrorCode.USER_NOT_FOUND });

    userRepository.findOne.mockResolvedValueOnce(
      createUser({ status: UserStatus.PENDING_VERIFICATION }),
    );
    await expect(
      service.updateUserStatus(ADMIN_ID, USER_ID, UserStatus.DISABLED),
    ).rejects.toMatchObject({
      code: ApiErrorCode.USER_STATUS_INVALID_TRANSITION,
    });

    userRepository.findOne.mockResolvedValueOnce(
      createUser({ status: UserStatus.DISABLED }),
    );
    await expect(
      service.updateUserStatus(ADMIN_ID, USER_ID, UserStatus.DISABLED),
    ).rejects.toMatchObject({
      code: ApiErrorCode.USER_STATUS_INVALID_TRANSITION,
    });
  });
});
