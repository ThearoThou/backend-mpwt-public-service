import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Repository } from 'typeorm';

import { UserRole } from '../users/enums/user-role.enum';
import { AuthHashingService } from './auth-hashing.service';
import { AuthTokenService } from './auth-token.service';
import { RefreshSession } from './entities/refresh-session.entity';
import {
  REFRESH_SESSION_LIFETIME_MS,
  RefreshSessionRevocationReason,
  RefreshSessionService,
} from './refresh-session.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '33333333-3333-4333-8333-333333333333';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-08-01T00:00:00.000Z');

function createConfigService(): ConfigService {
  const values: Record<string, string> = {
    JWT_ACCESS_SECRET: 'access-secret-for-unit-tests',
    JWT_ACCESS_EXPIRES_IN: '30m',
    JWT_REFRESH_SECRET: 'refresh-secret-for-unit-tests',
    JWT_REFRESH_EXPIRES_IN: '7d',
  };

  return {
    getOrThrow: jest.fn((name: string) => values[name]),
  } as unknown as ConfigService;
}

function createSession(
  overrides: Partial<RefreshSession> = {},
): RefreshSession {
  return {
    id: SESSION_ID,
    userId: USER_ID,
    tokenHash: 'old-hash',
    expiresAt: new Date(NOW.getTime() + 60 * 60 * 1_000),
    lastUsedAt: null,
    revokedAt: null,
    revocationReason: null,
    reuseDetectedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    user: {} as RefreshSession['user'],
    ...overrides,
  };
}

function createRepository(): jest.Mocked<
  Pick<
    Repository<RefreshSession>,
    'create' | 'save' | 'findOne' | 'findOneBy' | 'findBy'
  >
> {
  return {
    create: jest.fn(
      (value: Partial<RefreshSession>) => value as RefreshSession,
    ),
    save: jest.fn((value: RefreshSession | RefreshSession[]) => value),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    findBy: jest.fn(),
  };
}

describe('RefreshSessionService', () => {
  let repository: ReturnType<typeof createRepository>;
  let service: RefreshSessionService;

  beforeEach(() => {
    repository = createRepository();
    service = new RefreshSessionService(
      repository as unknown as Repository<RefreshSession>,
    );
  });

  it('prepares a session ID and fixed expiry before signing, then persists once', async () => {
    const tokenService = new AuthTokenService(
      new JwtService(),
      createConfigService(),
    );
    const hashingService = new AuthHashingService();
    const draft = service.createSessionDraft(USER_ID, NOW);
    const refreshToken = await tokenService.signRefreshToken(
      {
        userId: USER_ID,
        sessionId: draft.id,
        expiresAt: draft.expiresAt,
      },
      NOW,
    );
    const tokenHash = await hashingService.hashSecret(refreshToken.token);
    const exposedExpiry = draft.expiresAt;
    exposedExpiry.setTime(NOW.getTime());
    const session = await service.persistSession({ draft, tokenHash });
    const accessToken = await tokenService.signAccessToken(
      {
        userId: USER_ID,
        role: UserRole.CITIZEN,
        sessionId: draft.id,
        expiresAt: draft.expiresAt,
      },
      NOW,
    );

    expect(draft.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(draft.expiresAt).toEqual(
      new Date(NOW.getTime() + REFRESH_SESSION_LIFETIME_MS),
    );
    expect(draft.expiresAt).not.toBe(exposedExpiry);
    expect(refreshToken.claims.sid).toBe(draft.id);
    expect(accessToken.claims.sid).toBe(draft.id);
    expect(session.id).toBe(refreshToken.claims.sid);
    await expect(
      hashingService.verifySecret(session.tokenHash, refreshToken.token),
    ).resolves.toBe(true);
    expect(session.expiresAt).toEqual(draft.expiresAt);
    expect(session.expiresAt).not.toBe(draft.expiresAt);
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(session).not.toHaveProperty('token');
  });

  it('uses the supplied transaction manager and a pessimistic write lock for refresh', async () => {
    const lockedRepository = { findOne: jest.fn().mockResolvedValue(null) };
    const manager = {
      getRepository: jest.fn(() => lockedRepository),
    };

    await service.findLockedSessionForRefresh(
      SESSION_ID,
      manager as unknown as Parameters<
        RefreshSessionService['findLockedSessionForRefresh']
      >[1],
    );

    expect(manager.getRepository).toHaveBeenCalledWith(RefreshSession);
    expect(lockedRepository.findOne).toHaveBeenCalledWith({
      where: { id: SESSION_ID },
      lock: { mode: 'pessimistic_write' },
      select: {
        id: true,
        userId: true,
        tokenHash: true,
        expiresAt: true,
        lastUsedAt: true,
        revokedAt: true,
        revocationReason: true,
        reuseDetectedAt: true,
      },
    });
    expect(repository.findOne).not.toHaveBeenCalled();
  });

  it('accepts only an active session belonging to the expected user', async () => {
    repository.findOne.mockResolvedValue(createSession());

    await expect(
      service.validateActiveSessionForUser(SESSION_ID, USER_ID, undefined, NOW),
    ).resolves.toMatchObject({ id: SESSION_ID, userId: USER_ID });
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: SESSION_ID, userId: USER_ID },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        revokedAt: true,
      },
    });

    repository.findOne.mockResolvedValueOnce(null);
    await expect(
      service.validateActiveSessionForUser(
        SESSION_ID,
        OTHER_USER_ID,
        undefined,
        NOW,
      ),
    ).resolves.toBeNull();

    repository.findOne.mockResolvedValueOnce(
      createSession({ revokedAt: NOW, revocationReason: 'LOGOUT' }),
    );
    await expect(
      service.validateActiveSessionForUser(SESSION_ID, USER_ID, undefined, NOW),
    ).resolves.toBeNull();

    repository.findOne.mockResolvedValueOnce(
      createSession({ expiresAt: new Date(NOW.getTime() - 1) }),
    );
    await expect(
      service.validateActiveSessionForUser(SESSION_ID, USER_ID, undefined, NOW),
    ).resolves.toBeNull();
  });

  it('rotates only the hash and preserves the original fixed expiry', async () => {
    const session = createSession();
    const originalExpiry = session.expiresAt;

    const rotated = await service.rotateTokenHash(
      session,
      'new-hash',
      undefined,
      NOW,
    );

    expect(rotated).toMatchObject({ tokenHash: 'new-hash', lastUsedAt: NOW });
    expect(rotated?.expiresAt).toBe(originalExpiry);
  });

  it('revokes the current session and all active sessions for a user', async () => {
    const current = createSession();
    repository.findOneBy.mockResolvedValueOnce(current);

    const revoked = await service.revokeCurrentSession(
      SESSION_ID,
      USER_ID,
      RefreshSessionRevocationReason.LOGOUT,
      undefined,
      NOW,
    );

    expect(revoked).toMatchObject({
      revokedAt: NOW,
      revocationReason: RefreshSessionRevocationReason.LOGOUT,
    });

    const active = createSession({
      id: '44444444-4444-4444-8444-444444444444',
    });
    const expired = createSession({ expiresAt: new Date(NOW.getTime() - 1) });
    repository.findBy.mockResolvedValueOnce([active, expired]);

    await expect(
      service.revokeAllActiveSessions(
        USER_ID,
        RefreshSessionRevocationReason.PASSWORD_RESET,
        undefined,
        NOW,
      ),
    ).resolves.toBe(1);
    expect(active.revocationReason).toBe(
      RefreshSessionRevocationReason.PASSWORD_RESET,
    );
    expect(expired.revokedAt).toBeNull();
  });

  it('marks token reuse and revokes only the affected session', async () => {
    const session = createSession();
    repository.findOneBy.mockResolvedValueOnce(session);

    const revoked = await service.markTokenReuseAndRevoke(
      SESSION_ID,
      USER_ID,
      undefined,
      NOW,
    );

    expect(revoked).toMatchObject({
      reuseDetectedAt: NOW,
      revokedAt: NOW,
      revocationReason: RefreshSessionRevocationReason.TOKEN_REUSE,
    });
  });
});
