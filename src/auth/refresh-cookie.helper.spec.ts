import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

import { RefreshCookieHelper } from './refresh-cookie.helper';

const NOW = new Date('2026-08-01T00:00:00.000Z');
const EXPIRES_AT = new Date(NOW.getTime() + 60_000);

function createConfigService(
  secure: boolean,
  apiPrefix = '/api',
): ConfigService {
  const values: Record<string, string | boolean> = {
    REFRESH_COOKIE_NAME: 'mpwt_refresh',
    REFRESH_COOKIE_SECURE: secure,
    REFRESH_COOKIE_SAME_SITE: 'lax',
    API_PREFIX: apiPrefix,
  };

  return {
    getOrThrow: jest.fn((name: string) => values[name]),
  } as unknown as ConfigService;
}

function createResponse(): {
  response: Response;
  cookie: jest.Mock;
  clearCookie: jest.Mock;
} {
  const cookie = jest.fn();
  const clearCookie = jest.fn();

  return {
    response: { cookie, clearCookie } as unknown as Response,
    cookie,
    clearCookie,
  };
}

describe('RefreshCookieHelper', () => {
  it('uses secure local-development cookie options with a narrow auth path', () => {
    const helper = new RefreshCookieHelper(createConfigService(false));
    const { response, cookie } = createResponse();

    helper.setRefreshToken(response, 'raw-refresh-token', EXPIRES_AT, NOW);

    expect(cookie).toHaveBeenCalledWith(
      'mpwt_refresh',
      'raw-refresh-token',
      expect.objectContaining({
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/api/auth',
        expires: EXPIRES_AT,
        maxAge: 60_000,
      }),
    );
  });

  it('preserves production secure mode and matching clear-cookie attributes', () => {
    const helper = new RefreshCookieHelper(createConfigService(true, 'api'));
    const { response, cookie, clearCookie } = createResponse();

    helper.setRefreshToken(response, 'raw-refresh-token', EXPIRES_AT, NOW);
    helper.clearRefreshToken(response);

    expect(cookie).toHaveBeenCalledWith(
      'mpwt_refresh',
      'raw-refresh-token',
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/api/auth',
      }),
    );
    expect(clearCookie).toHaveBeenCalledWith(
      'mpwt_refresh',
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/api/auth',
        maxAge: 0,
      }),
    );
  });

  it('reads only the configured refresh cookie and rejects an expired session', () => {
    const helper = new RefreshCookieHelper(createConfigService(false));
    const { response } = createResponse();

    expect(
      helper.readRefreshToken({
        cookies: { mpwt_refresh: 'token' },
      } as Request),
    ).toBe('token');
    expect(helper.readRefreshToken({ cookies: {} } as Request)).toBeUndefined();
    expect(() =>
      helper.setRefreshToken(response, 'raw-refresh-token', NOW, NOW),
    ).toThrow(RangeError);
  });
});
