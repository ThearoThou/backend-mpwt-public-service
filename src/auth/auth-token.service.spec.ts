import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { ApiErrorCode } from '../common/errors/api-error-code';
import { UserRole } from '../users/enums/user-role.enum';
import { AuthTokenService } from './auth-token.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2030-08-01T00:00:00.000Z');
const ACCESS_SECRET = 'access-secret-for-unit-tests';
const REFRESH_SECRET = 'refresh-secret-for-unit-tests';

function createConfigService(): ConfigService {
  const values: Record<string, string> = {
    JWT_ACCESS_SECRET: ACCESS_SECRET,
    JWT_ACCESS_EXPIRES_IN: '30m',
    JWT_REFRESH_SECRET: REFRESH_SECRET,
    JWT_REFRESH_EXPIRES_IN: '7d',
  };

  return {
    getOrThrow: jest.fn((name: string) => values[name]),
  } as unknown as ConfigService;
}

function numericDate(value: Date): number {
  return Math.floor(value.getTime() / 1_000);
}

describe('AuthTokenService', () => {
  let jwtService: JwtService;
  let tokenService: AuthTokenService;

  beforeEach(() => {
    jwtService = new JwtService();
    tokenService = new AuthTokenService(jwtService, createConfigService());
  });

  it('signs and verifies typed HS256 access claims with a 30-minute absolute expiry', async () => {
    const signed = await tokenService.signAccessToken(
      {
        userId: USER_ID,
        role: UserRole.CITIZEN,
        sessionId: SESSION_ID,
        expiresAt: new Date(NOW.getTime() + 60 * 60 * 1_000),
      },
      NOW,
    );

    expect(signed.claims).toEqual({
      sub: USER_ID,
      role: UserRole.CITIZEN,
      sid: SESSION_ID,
      typ: 'access',
      exp: numericDate(NOW) + 1_800,
    });
    expect(signed.expiresIn).toBe(1_800);
    expect(jwtService.decode(signed.token, { complete: true })).toMatchObject({
      header: { alg: 'HS256' },
      payload: { exp: numericDate(NOW) + 1_800 },
    });
    await expect(
      tokenService.verifyAccessToken(signed.token, NOW),
    ).resolves.toMatchObject(signed.claims);
  });

  it('signs and verifies refresh claims with the fixed session expiry at second precision', async () => {
    const expiresAt = new Date(NOW.getTime() + 90 * 1_000);
    const signed = await tokenService.signRefreshToken(
      {
        userId: USER_ID,
        sessionId: SESSION_ID,
        expiresAt,
      },
      NOW,
    );

    expect(signed.claims).toEqual({
      sub: USER_ID,
      sid: SESSION_ID,
      typ: 'refresh',
      exp: numericDate(expiresAt),
    });
    expect(signed.expiresIn).toBe(90);
    await expect(
      tokenService.verifyRefreshToken(signed.token, NOW),
    ).resolves.toMatchObject(signed.claims);
  });

  it('rejects tokens signed with the wrong secret', async () => {
    const accessToken = await tokenService.signAccessToken(
      {
        userId: USER_ID,
        role: UserRole.ADMIN,
        sessionId: SESSION_ID,
        expiresAt: new Date(NOW.getTime() + 60 * 60 * 1_000),
      },
      NOW,
    );
    const refreshToken = await tokenService.signRefreshToken(
      {
        userId: USER_ID,
        sessionId: SESSION_ID,
        expiresAt: new Date(NOW.getTime() + 60 * 60 * 1_000),
      },
      NOW,
    );

    await expect(
      tokenService.verifyRefreshToken(accessToken.token, NOW),
    ).rejects.toMatchObject({ code: ApiErrorCode.AUTH_TOKEN_INVALID });
    await expect(
      tokenService.verifyAccessToken(refreshToken.token, NOW),
    ).rejects.toMatchObject({ code: ApiErrorCode.AUTH_TOKEN_INVALID });
  });

  it('rejects a valid signature with the wrong token type', async () => {
    const wrongType = await jwtService.signAsync(
      {
        sub: USER_ID,
        role: UserRole.CITIZEN,
        sid: SESSION_ID,
        typ: 'refresh',
        exp: numericDate(NOW) + 60,
      },
      { secret: ACCESS_SECRET, algorithm: 'HS256' },
    );

    await expect(
      tokenService.verifyAccessToken(wrongType, NOW),
    ).rejects.toMatchObject({
      code: ApiErrorCode.AUTH_TOKEN_INVALID,
    });
  });

  it('caps access-token expiry at the fixed refresh-session expiry', async () => {
    const expiresAt = new Date(NOW.getTime() + 45 * 1_000);
    const signed = await tokenService.signAccessToken(
      {
        userId: USER_ID,
        role: UserRole.ADMIN,
        sessionId: SESSION_ID,
        expiresAt,
      },
      NOW,
    );

    expect(signed.expiresIn).toBe(45);
    expect(signed.claims.exp).toBe(numericDate(expiresAt));
  });

  it('does not extend either token beyond the fixed session deadline after signing delay', async () => {
    const expiresAt = new Date(NOW.getTime() + 60 * 1_000);
    const accessToken = await tokenService.signAccessToken(
      {
        userId: USER_ID,
        role: UserRole.ADMIN,
        sessionId: SESSION_ID,
        expiresAt,
      },
      NOW,
    );
    const refreshToken = await tokenService.signRefreshToken(
      {
        userId: USER_ID,
        sessionId: SESSION_ID,
        expiresAt,
      },
      NOW,
    );

    const delayedNow = new Date(NOW.getTime() + 30 * 1_000);

    const delayedAccessToken = await tokenService.signAccessToken(
      {
        userId: USER_ID,
        role: UserRole.ADMIN,
        sessionId: SESSION_ID,
        expiresAt,
      },
      delayedNow,
    );
    const delayedRefreshToken = await tokenService.signRefreshToken(
      {
        userId: USER_ID,
        sessionId: SESSION_ID,
        expiresAt,
      },
      delayedNow,
    );

    expect(accessToken.claims.exp).toBe(numericDate(expiresAt));
    expect(refreshToken.claims.exp).toBe(numericDate(expiresAt));
    expect(delayedAccessToken.claims.exp).toBe(numericDate(expiresAt));
    expect(delayedRefreshToken.claims.exp).toBe(numericDate(expiresAt));
  });

  it('rejects expired session input before signing', async () => {
    await expect(
      tokenService.signAccessToken(
        {
          userId: USER_ID,
          role: UserRole.CITIZEN,
          sessionId: SESSION_ID,
          expiresAt: NOW,
        },
        NOW,
      ),
    ).rejects.toMatchObject({ code: ApiErrorCode.AUTH_TOKEN_INVALID });
    await expect(
      tokenService.signRefreshToken(
        {
          userId: USER_ID,
          sessionId: SESSION_ID,
          expiresAt: NOW,
        },
        NOW,
      ),
    ).rejects.toMatchObject({ code: ApiErrorCode.AUTH_TOKEN_INVALID });
  });

  it('rejects tokens using an unapproved JWT algorithm', async () => {
    const accessToken = await jwtService.signAsync(
      {
        sub: USER_ID,
        role: UserRole.CITIZEN,
        sid: SESSION_ID,
        typ: 'access',
        exp: numericDate(NOW) + 60,
      },
      { secret: ACCESS_SECRET, algorithm: 'HS384' },
    );
    const refreshToken = await jwtService.signAsync(
      {
        sub: USER_ID,
        sid: SESSION_ID,
        typ: 'refresh',
        exp: numericDate(NOW) + 60,
      },
      { secret: REFRESH_SECRET, algorithm: 'HS384' },
    );

    await expect(
      tokenService.verifyAccessToken(accessToken, NOW),
    ).rejects.toMatchObject({ code: ApiErrorCode.AUTH_TOKEN_INVALID });
    await expect(
      tokenService.verifyRefreshToken(refreshToken, NOW),
    ).rejects.toMatchObject({ code: ApiErrorCode.AUTH_TOKEN_INVALID });
  });
});
