import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';

import { normalizeApiPrefix } from '../common/http/api-prefix';

@Injectable()
export class RefreshCookieHelper {
  constructor(private readonly configService: ConfigService) {}

  readRefreshToken(request: Request): string | undefined {
    const value: unknown = request.cookies?.[this.getName()];

    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  setRefreshToken(
    response: Response,
    token: string,
    expiresAt: Date,
    now = new Date(),
  ): void {
    response.cookie(this.getName(), token, this.getSetOptions(expiresAt, now));
  }

  clearRefreshToken(response: Response): void {
    response.clearCookie(this.getName(), {
      ...this.getBaseOptions(),
      expires: new Date(0),
      maxAge: 0,
    });
  }

  private getSetOptions(expiresAt: Date, now: Date): CookieOptions {
    const maxAge = expiresAt.getTime() - now.getTime();

    if (maxAge <= 0) {
      throw new RangeError('Refresh-session expiry must be in the future');
    }

    return {
      ...this.getBaseOptions(),
      expires: expiresAt,
      maxAge,
    };
  }

  private getBaseOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.configService.getOrThrow<boolean>('REFRESH_COOKIE_SECURE'),
      sameSite: this.configService.getOrThrow<'lax' | 'strict'>(
        'REFRESH_COOKIE_SAME_SITE',
      ),
      path: `/${normalizeApiPrefix(
        this.configService.getOrThrow<string>('API_PREFIX'),
      )}/auth`,
    };
  }

  private getName(): string {
    return this.configService.getOrThrow<string>('REFRESH_COOKIE_NAME');
  }
}
