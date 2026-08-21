import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DataSource, EntityManager } from 'typeorm';

import { AuthHashingService } from './auth-hashing.service';
import { AuthService } from './auth.service';
import { AuthTokenService } from './auth-token.service';
import { VerificationPurpose } from './enums/verification-purpose.enum';
import {
  RefreshSessionRevocationReason,
  RefreshSessionService,
} from './refresh-session.service';
import { VerificationCodeService } from './verification-code.service';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { UsersService } from '../users/users.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2030-08-01T00:00:00.000Z');
const SESSION_EXPIRY = new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1_000);

function createUser(overrides: Partial<User> = {}): User {
  return {
    id: USER_ID,
    role: UserRole.CITIZEN,
    status: UserStatus.ACTIVE,
    phone: '+85512345678',
    email: 'citizen@example.com',
    passwordHash: 'password-hash',
    phoneVerifiedAt: null,
    emailVerifiedAt: null,
    lastLoginAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as User;
}

describe('AuthService', () => {
  let manager: EntityManager;
  let dataSource: { transaction: jest.Mock };
  let users: jest.Mocked<
    Pick<
      UsersService,
      | 'hasIdentifierConflict'
      | 'createPendingCitizen'
      | 'findLockedUserByIdentifier'
      | 'findUserByIdentifier'
      | 'findUserForLogin'
      | 'findUserByIdForRefresh'
      | 'activateCitizenForIdentifier'
      | 'recordLogin'
      | 'replacePassword'
    >
  >;
  let verificationCodes: jest.Mocked<
    Pick<
      VerificationCodeService,
      'createCode' | 'validateLockedCode' | 'consumeCode'
    >
  >;
  let hashing: jest.Mocked<
    Pick<AuthHashingService, 'hashSecret' | 'verifySecret'>
  >;
  let tokens: jest.Mocked<
    Pick<
      AuthTokenService,
      'signAccessToken' | 'signRefreshToken' | 'verifyRefreshToken'
    >
  >;
  let sessions: jest.Mocked<
    Pick<
      RefreshSessionService,
      | 'createSessionDraft'
      | 'persistSession'
      | 'findLockedSessionForRefresh'
      | 'rotateTokenHash'
      | 'markLockedTokenReuseAndRevoke'
      | 'revokeLockedSession'
      | 'revokeAllActiveSessions'
    >
  >;
  let service: AuthService;

  beforeEach(() => {
    manager = {} as EntityManager;
    dataSource = {
      transaction: jest.fn((callback: (current: EntityManager) => unknown) =>
        Promise.resolve(callback(manager)),
      ),
    };
    users = {
      hasIdentifierConflict: jest.fn(),
      createPendingCitizen: jest.fn(),
      findLockedUserByIdentifier: jest.fn(),
      findUserByIdentifier: jest.fn(),
      findUserForLogin: jest.fn(),
      findUserByIdForRefresh: jest.fn(),
      activateCitizenForIdentifier: jest.fn(),
      recordLogin: jest.fn(),
      replacePassword: jest.fn(),
    };
    verificationCodes = {
      createCode: jest.fn(),
      validateLockedCode: jest.fn(),
      consumeCode: jest.fn(),
    };
    hashing = {
      hashSecret: jest.fn().mockResolvedValue('argon2id-hash'),
      verifySecret: jest.fn().mockResolvedValue(true),
    };
    tokens = {
      signAccessToken: jest.fn().mockResolvedValue({
        token: 'access-token',
        claims: {},
        expiresIn: 1_800,
      }),
      signRefreshToken: jest.fn().mockResolvedValue({
        token: 'refresh-token',
        claims: {},
        expiresIn: 604_800,
      }),
      verifyRefreshToken: jest.fn(),
    };
    sessions = {
      createSessionDraft: jest.fn().mockReturnValue({
        id: SESSION_ID,
        userId: USER_ID,
        expiresAt: SESSION_EXPIRY,
      }),
      persistSession: jest.fn(),
      findLockedSessionForRefresh: jest.fn(),
      rotateTokenHash: jest.fn(),
      markLockedTokenReuseAndRevoke: jest.fn(),
      revokeLockedSession: jest.fn(),
      revokeAllActiveSessions: jest.fn(),
    };
    const config = {
      getOrThrow: jest.fn((name: string) => {
        if (name === 'NODE_ENV') {
          return 'development';
        }

        if (name === 'EXPOSE_DEVELOPMENT_VERIFICATION_CODE') {
          return true;
        }

        throw new Error(`Unexpected config key ${name}`);
      }),
    } as unknown as ConfigService;

    service = new AuthService(
      dataSource as unknown as DataSource,
      users as UsersService,
      verificationCodes as VerificationCodeService,
      hashing,
      tokens as AuthTokenService,
      sessions as RefreshSessionService,
      config,
    );
  });

  it('registers a pending citizen, profile, and hashed code transactionally without a session', async () => {
    const pendingUser = createUser({
      status: UserStatus.PENDING_VERIFICATION,
    });
    users.hasIdentifierConflict.mockResolvedValue(false);
    users.createPendingCitizen.mockResolvedValue(pendingUser);
    verificationCodes.createCode.mockResolvedValue({
      code: '012345',
      expiresAt: new Date(NOW.getTime() + 300_000),
    });

    const response = await service.register({
      phone: '012 345 678',
      email: 'Citizen@Example.com',
      verificationIdentifier: ' citizen@example.COM ',
      password: 'password1',
      nameKh: 'ណាមខ្មែរ',
      nameEn: 'Citizen Name',
    });

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(users.createPendingCitizen).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: '+85512345678',
        email: 'citizen@example.com',
        passwordHash: 'argon2id-hash',
      }),
      manager,
    );
    expect(verificationCodes.createCode).toHaveBeenCalledWith(
      {
        userId: USER_ID,
        destination: 'citizen@example.com',
        purpose: VerificationPurpose.REGISTER_ACCOUNT,
      },
      manager,
      expect.any(Date),
    );
    expect(response).toMatchObject({
      verificationRequired: true,
      development: {
        developmentCode: '012345',
        purpose: VerificationPurpose.REGISTER_ACCOUNT,
      },
    });
    expect(sessions.createSessionDraft).not.toHaveBeenCalled();
    expect(tokens.signAccessToken).not.toHaveBeenCalled();
  });

  it('maps registration phone and email unique violations to USER_IDENTIFIER_CONFLICT', async () => {
    for (const constraint of [
      'UQ_a000cca60bcf04454e727699490',
      'UQ_97672ac88f789774dd47f7c8be3',
    ]) {
      dataSource.transaction.mockRejectedValueOnce({
        code: '23505',
        constraint,
      });

      await expect(
        service.register({
          phone: '012345678',
          password: 'password1',
          nameKh: 'ណាមខ្មែរ',
          nameEn: 'Citizen Name',
        }),
      ).rejects.toMatchObject({
        code: ApiErrorCode.USER_IDENTIFIER_CONFLICT,
        status: HttpStatus.CONFLICT,
      });
    }
  });

  it('maps the known national-ID uniqueness violation to the safe generic conflict', async () => {
    dataSource.transaction.mockRejectedValueOnce({
      code: '23505',
      constraint: 'UQ_aa30876112d7d4c1ab2d9e7c6c9',
    });

    await expect(
      service.register({
        phone: '012345678',
        password: 'password1',
        nameKh: 'ណាមខ្មែរ',
        nameEn: 'Citizen Name',
        nationalIdNumber: 'NID-duplicate',
      }),
    ).rejects.toMatchObject({
      code: ApiErrorCode.CONFLICT,
      status: HttpStatus.CONFLICT,
    });
  });

  it('leaves unrelated registration database failures for the global safe error handler', async () => {
    const databaseFailure = new Error('database unavailable');
    dataSource.transaction.mockRejectedValueOnce(databaseFailure);

    await expect(
      service.register({
        phone: '012345678',
        password: 'password1',
        nameKh: 'ណាមខ្មែរ',
        nameEn: 'Citizen Name',
      }),
    ).rejects.toBe(databaseFailure);
  });

  it('commits invalid verification outcomes before exposing the approved error', async () => {
    users.findLockedUserByIdentifier.mockResolvedValue(
      createUser({ status: UserStatus.PENDING_VERIFICATION }),
    );
    verificationCodes.validateLockedCode.mockResolvedValue({ kind: 'invalid' });

    await expect(
      service.verifyAccount({ identifier: '+85512345678', code: '999999' }),
    ).rejects.toMatchObject({
      code: ApiErrorCode.AUTH_VERIFICATION_CODE_INVALID,
    });

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(users.activateCitizenForIdentifier).not.toHaveBeenCalled();
    expect(sessions.persistSession).not.toHaveBeenCalled();
  });

  it('activates a verified citizen and issues one session-bound token pair', async () => {
    const pendingUser = createUser({
      status: UserStatus.PENDING_VERIFICATION,
    });
    const activeUser = createUser({
      status: UserStatus.ACTIVE,
      phoneVerifiedAt: NOW,
    });
    const verificationCode = { id: 'code-id' } as never;
    users.findLockedUserByIdentifier.mockResolvedValue(pendingUser);
    verificationCodes.validateLockedCode.mockResolvedValue({
      kind: 'valid',
      verificationCode,
    });
    users.activateCitizenForIdentifier.mockResolvedValue(activeUser);

    const result = await service.verifyAccount({
      identifier: '+85512345678',
      code: '012345',
    });

    expect(verificationCodes.consumeCode).toHaveBeenCalledWith(
      verificationCode,
      manager,
      expect.any(Date),
    );
    expect(tokens.signRefreshToken).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        expiresAt: SESSION_EXPIRY,
      }),
      expect.any(Date),
    );
    const persistedInput = sessions.persistSession.mock.calls[0]?.[0];
    expect(persistedInput?.draft.id).toBe(SESSION_ID);
    expect(persistedInput?.tokenHash).toBe('argon2id-hash');
    expect(sessions.persistSession.mock.calls[0]?.[1]).toBe(manager);
    expect(tokens.signAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({
        role: UserRole.CITIZEN,
        sessionId: SESSION_ID,
        expiresAt: SESSION_EXPIRY,
      }),
      expect.any(Date),
    );
    expect(result.response).toEqual(
      expect.objectContaining({
        accessToken: 'access-token',
        expiresIn: 1_800,
      }),
    );
    expect(result.response).not.toHaveProperty('refreshToken');
    expect(result.refreshToken).toBe('refresh-token');
  });

  it('uses approved login errors and writes lastLoginAt/session together', async () => {
    users.findUserForLogin.mockResolvedValue(null);
    await expect(
      service.login({
        identifier: 'citizen@example.com',
        password: 'password1',
      }),
    ).rejects.toMatchObject({ code: ApiErrorCode.AUTH_INVALID_CREDENTIALS });

    const pendingUser = createUser({
      status: UserStatus.PENDING_VERIFICATION,
    });
    users.findUserForLogin.mockResolvedValue(pendingUser);
    await expect(
      service.login({
        identifier: 'citizen@example.com',
        password: 'password1',
      }),
    ).rejects.toMatchObject({ code: ApiErrorCode.AUTH_ACCOUNT_NOT_ACTIVE });

    const disabledUser = createUser({ status: UserStatus.DISABLED });
    users.findUserForLogin.mockResolvedValue(disabledUser);
    await expect(
      service.login({
        identifier: 'citizen@example.com',
        password: 'password1',
      }),
    ).rejects.toMatchObject({ code: ApiErrorCode.AUTH_ACCOUNT_DISABLED });

    const activeUser = createUser();
    users.findUserForLogin.mockResolvedValue(activeUser);
    users.recordLogin.mockResolvedValue(activeUser);
    await service.login({
      identifier: 'citizen@example.com',
      password: 'password1',
    });

    expect(users.recordLogin).toHaveBeenCalledWith(
      activeUser,
      manager,
      expect.any(Date),
    );
    expect(sessions.persistSession).toHaveBeenCalledWith(
      expect.any(Object),
      manager,
    );
  });

  it('performs Argon2id verification for known wrong and unknown identifiers without issuing credentials', async () => {
    const wrongPassword = 'wrong-password';
    const getLoginError = async (): Promise<DomainException> => {
      try {
        await service.login({
          identifier: 'citizen@example.com',
          password: wrongPassword,
        });
      } catch (error) {
        if (error instanceof DomainException) {
          return error;
        }

        throw error;
      }

      throw new Error('Expected login to fail.');
    };

    const knownUser = createUser({ passwordHash: 'known-user-hash' });
    users.findUserForLogin.mockResolvedValueOnce(knownUser);
    hashing.verifySecret.mockResolvedValue(false);
    const knownError = await getLoginError();

    users.findUserForLogin.mockResolvedValue(null);
    const unknownError = await getLoginError();
    await getLoginError();

    expect(knownError.code).toBe(ApiErrorCode.AUTH_INVALID_CREDENTIALS);
    expect(unknownError.code).toBe(knownError.code);
    expect(unknownError.getStatus()).toBe(knownError.getStatus());
    expect(unknownError.safeMessage).toBe(knownError.safeMessage);
    expect(hashing.verifySecret).toHaveBeenNthCalledWith(
      1,
      'known-user-hash',
      wrongPassword,
    );
    expect(hashing.verifySecret).toHaveBeenNthCalledWith(
      2,
      'argon2id-hash',
      wrongPassword,
    );
    expect(hashing.verifySecret).toHaveBeenNthCalledWith(
      3,
      'argon2id-hash',
      wrongPassword,
    );
    expect(hashing.hashSecret).toHaveBeenCalledTimes(1);
    expect(sessions.createSessionDraft).not.toHaveBeenCalled();
    expect(sessions.persistSession).not.toHaveBeenCalled();
    expect(tokens.signAccessToken).not.toHaveBeenCalled();
    expect(tokens.signRefreshToken).not.toHaveBeenCalled();
  });

  it('accepts only an actually absent refresh/logout body', () => {
    const absentRequest = { headers: {} };
    const emptyJsonRequest = { headers: { 'content-length': '2' } };

    expect(() =>
      service.assertNoJsonBody(undefined, absentRequest),
    ).not.toThrow();
    expect(() => service.assertNoJsonBody({}, emptyJsonRequest)).toThrow(
      DomainException,
    );
    expect(() =>
      service.assertNoJsonBody(
        { refreshToken: 'client-supplied-token' },
        { headers: { 'content-length': '42' } },
      ),
    ).toThrow(DomainException);
  });

  it('uses a server-selected reset purpose and revokes all sessions after a valid reset', async () => {
    const user = createUser();
    const verificationCode = { id: 'reset-code' } as never;
    users.findLockedUserByIdentifier.mockResolvedValue(user);
    verificationCodes.validateLockedCode.mockResolvedValue({
      kind: 'valid',
      verificationCode,
    });

    const response = await service.confirmPasswordReset({
      identifier: '+85512345678',
      code: '012345',
      newPassword: 'new-password',
    });

    expect(verificationCodes.validateLockedCode).toHaveBeenCalledWith(
      USER_ID,
      '+85512345678',
      VerificationPurpose.RESET_PASSWORD,
      '012345',
      manager,
      expect.any(Date),
    );
    expect(users.replacePassword).toHaveBeenCalledWith(
      user,
      'argon2id-hash',
      manager,
    );
    expect(sessions.revokeAllActiveSessions).toHaveBeenCalledWith(
      USER_ID,
      RefreshSessionRevocationReason.PASSWORD_RESET,
      manager,
      expect.any(Date),
    );
    expect(sessions.createSessionDraft).not.toHaveBeenCalled();
    expect(response).toMatchObject({ verificationRequired: false });
  });

  it('verifies a reset code without changing the password or consuming the code', async () => {
    const user = createUser();
    const verificationCode = { id: 'reset-code' } as never;
    users.findLockedUserByIdentifier.mockResolvedValue(user);
    verificationCodes.validateLockedCode.mockResolvedValue({
      kind: 'valid',
      verificationCode,
    });

    const response = await service.verifyPasswordReset({
      identifier: '+85512345678',
      code: '012345',
    });

    expect(verificationCodes.validateLockedCode).toHaveBeenCalledWith(
      USER_ID,
      '+85512345678',
      VerificationPurpose.RESET_PASSWORD,
      '012345',
      manager,
      expect.any(Date),
    );
    expect(verificationCodes.consumeCode).not.toHaveBeenCalled();
    expect(users.replacePassword).not.toHaveBeenCalled();
    expect(response).toMatchObject({ verificationRequired: false });
  });

  it('rotates the same active refresh session without extending its expiry', async () => {
    const user = createUser();
    const session = {
      id: SESSION_ID,
      userId: USER_ID,
      tokenHash: 'old-token-hash',
      expiresAt: SESSION_EXPIRY,
      revokedAt: null,
    } as never;
    tokens.verifyRefreshToken.mockResolvedValue({
      sub: USER_ID,
      sid: SESSION_ID,
      typ: 'refresh',
      exp: Math.floor(SESSION_EXPIRY.getTime() / 1_000),
    });
    sessions.findLockedSessionForRefresh.mockResolvedValue(session);
    users.findUserByIdForRefresh.mockResolvedValue(user);
    hashing.verifySecret.mockResolvedValue(true);
    sessions.rotateTokenHash.mockResolvedValue(session);

    const result = await service.refresh('old-refresh-token');

    expect(sessions.findLockedSessionForRefresh).toHaveBeenCalledWith(
      SESSION_ID,
      manager,
    );
    expect(sessions.rotateTokenHash).toHaveBeenCalledWith(
      session,
      'argon2id-hash',
      manager,
      expect.any(Date),
    );
    expect(tokens.signRefreshToken).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        expiresAt: SESSION_EXPIRY,
      }),
      expect.any(Date),
    );
    expect(sessions.createSessionDraft).not.toHaveBeenCalled();
    expect(result.refreshExpiresAt).toEqual(SESSION_EXPIRY);
    expect(result.response).not.toHaveProperty('refreshToken');
  });

  it('commits rotated-token reuse revocation before returning AUTH_TOKEN_INVALID', async () => {
    const session = {
      id: SESSION_ID,
      userId: USER_ID,
      tokenHash: 'rotated-hash',
      expiresAt: SESSION_EXPIRY,
      revokedAt: null,
    } as never;
    tokens.verifyRefreshToken.mockResolvedValue({
      sub: USER_ID,
      sid: SESSION_ID,
      typ: 'refresh',
      exp: Math.floor(SESSION_EXPIRY.getTime() / 1_000),
    });
    sessions.findLockedSessionForRefresh.mockResolvedValue(session);
    users.findUserByIdForRefresh.mockResolvedValue(createUser());
    hashing.verifySecret.mockResolvedValue(false);

    await expect(service.refresh('reused-token')).rejects.toMatchObject({
      code: ApiErrorCode.AUTH_TOKEN_INVALID,
    });

    expect(sessions.markLockedTokenReuseAndRevoke).toHaveBeenCalledWith(
      session,
      manager,
      expect.any(Date),
    );
    expect(tokens.signRefreshToken).not.toHaveBeenCalled();
  });

  it('revokes only the matching valid logout session and treats invalid cookies as idempotent', async () => {
    const session = {
      id: SESSION_ID,
      userId: USER_ID,
      tokenHash: 'token-hash',
      expiresAt: SESSION_EXPIRY,
      revokedAt: null,
    } as never;
    tokens.verifyRefreshToken.mockResolvedValue({
      sub: USER_ID,
      sid: SESSION_ID,
      typ: 'refresh',
      exp: Math.floor(SESSION_EXPIRY.getTime() / 1_000),
    });
    sessions.findLockedSessionForRefresh.mockResolvedValue(session);
    hashing.verifySecret.mockResolvedValue(true);

    await expect(service.logout('refresh-token')).resolves.toBeUndefined();

    expect(sessions.revokeLockedSession).toHaveBeenCalledWith(
      session,
      RefreshSessionRevocationReason.LOGOUT,
      manager,
      expect.any(Date),
    );

    tokens.verifyRefreshToken.mockRejectedValue(new Error('invalid'));
    await expect(service.logout('invalid-token')).resolves.toBeUndefined();
    expect(sessions.revokeLockedSession).toHaveBeenCalledTimes(1);
  });
});
