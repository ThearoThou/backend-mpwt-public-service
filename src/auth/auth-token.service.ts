import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { UserRole } from '../users/enums/user-role.enum';

const ACCESS_TOKEN_MAX_SECONDS = 30 * 60;
const JWT_ALGORITHM = 'HS256' as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface AccessTokenClaims {
  sub: string;
  role: UserRole.CITIZEN | UserRole.ADMIN;
  sid: string;
  typ: 'access';
  iat?: number;
  exp: number;
}

export interface RefreshTokenClaims {
  sub: string;
  sid: string;
  typ: 'refresh';
  iat?: number;
  exp: number;
}

export interface AccessTokenSubject {
  userId: string;
  role: UserRole.CITIZEN | UserRole.ADMIN;
  sessionId: string;
  expiresAt: Date;
}

export interface RefreshTokenSubject {
  userId: string;
  sessionId: string;
  expiresAt: Date;
}

export interface SignedAccessToken {
  token: string;
  claims: AccessTokenClaims;
  expiresIn: number;
}

export interface SignedRefreshToken {
  token: string;
  claims: RefreshTokenClaims;
  expiresIn: number;
}

@Injectable()
export class AuthTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async signAccessToken(
    subject: AccessTokenSubject,
    now = new Date(),
  ): Promise<SignedAccessToken> {
    const exp = this.getAccessTokenExpiration(subject.expiresAt, now);
    const expiresIn = exp - this.toNumericDate(now);
    const claims: AccessTokenClaims = {
      sub: subject.userId,
      role: subject.role,
      sid: subject.sessionId,
      typ: 'access',
      exp,
    };

    return {
      token: await this.jwtService.signAsync(claims, {
        secret: this.getAccessSecret(),
        algorithm: JWT_ALGORITHM,
      }),
      claims,
      expiresIn,
    };
  }

  async signRefreshToken(
    subject: RefreshTokenSubject,
    now = new Date(),
  ): Promise<SignedRefreshToken> {
    const exp = this.getRefreshTokenExpiration(subject.expiresAt, now);
    const expiresIn = exp - this.toNumericDate(now);
    const claims: RefreshTokenClaims = {
      sub: subject.userId,
      sid: subject.sessionId,
      typ: 'refresh',
      exp,
    };

    return {
      token: await this.jwtService.signAsync(claims, {
        secret: this.getRefreshSecret(),
        algorithm: JWT_ALGORITHM,
      }),
      claims,
      expiresIn,
    };
  }

  async verifyAccessToken(
    token: string,
    now = new Date(),
  ): Promise<AccessTokenClaims> {
    try {
      const payload = await this.jwtService.verifyAsync<
        Record<string, unknown>
      >(token, {
        secret: this.getAccessSecret(),
        algorithms: [JWT_ALGORITHM],
        clockTimestamp: this.toNumericDate(now),
      });
      const claims = this.parseAccessClaims(payload);

      if (claims === null) {
        throw this.invalidToken();
      }

      return claims;
    } catch {
      throw this.invalidToken();
    }
  }

  async verifyRefreshToken(
    token: string,
    now = new Date(),
  ): Promise<RefreshTokenClaims> {
    try {
      const payload = await this.jwtService.verifyAsync<
        Record<string, unknown>
      >(token, {
        secret: this.getRefreshSecret(),
        algorithms: [JWT_ALGORITHM],
        clockTimestamp: this.toNumericDate(now),
      });
      const claims = this.parseRefreshClaims(payload);

      if (claims === null) {
        throw this.invalidToken();
      }

      return claims;
    } catch {
      throw this.invalidToken();
    }
  }

  private getAccessTokenExpiration(expiresAt: Date, now: Date): number {
    this.configService.getOrThrow<string>('JWT_ACCESS_EXPIRES_IN');
    const nowNumericDate = this.toNumericDate(now);
    const sessionExpiration = this.toNumericDate(expiresAt);
    const expiration = Math.min(
      nowNumericDate + ACCESS_TOKEN_MAX_SECONDS,
      sessionExpiration,
    );

    return this.requireFutureExpiration(expiration, nowNumericDate);
  }

  private getRefreshTokenExpiration(expiresAt: Date, now: Date): number {
    const nowNumericDate = this.toNumericDate(now);
    const sessionExpiration = this.toNumericDate(expiresAt);

    return this.requireFutureExpiration(sessionExpiration, nowNumericDate);
  }

  private requireFutureExpiration(exp: number, now: number): number {
    if (exp <= now) {
      throw this.invalidToken();
    }

    return exp;
  }

  private toNumericDate(value: Date): number {
    return Math.floor(value.getTime() / 1_000);
  }

  private getAccessSecret(): string {
    return this.configService.getOrThrow<string>('JWT_ACCESS_SECRET');
  }

  private getRefreshSecret(): string {
    return this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');
  }

  private parseAccessClaims(payload: unknown): AccessTokenClaims | null {
    if (!this.isRecord(payload)) {
      return null;
    }

    const { sub, role, sid, typ, iat, exp } = payload;

    if (
      !this.isUuid(sub) ||
      !this.isUuid(sid) ||
      (role !== UserRole.CITIZEN && role !== UserRole.ADMIN) ||
      typ !== 'access' ||
      !this.isOptionalTimestamp(iat) ||
      !this.isNumericDate(exp)
    ) {
      return null;
    }

    return {
      sub,
      role,
      sid,
      typ,
      exp,
      ...(iat === undefined ? {} : { iat }),
    };
  }

  private parseRefreshClaims(payload: unknown): RefreshTokenClaims | null {
    if (!this.isRecord(payload)) {
      return null;
    }

    const { sub, sid, typ, iat, exp } = payload;

    if (
      !this.isUuid(sub) ||
      !this.isUuid(sid) ||
      typ !== 'refresh' ||
      !this.isOptionalTimestamp(iat) ||
      !this.isNumericDate(exp)
    ) {
      return null;
    }

    return {
      sub,
      sid,
      typ,
      exp,
      ...(iat === undefined ? {} : { iat }),
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private isUuid(value: unknown): value is string {
    return typeof value === 'string' && UUID_PATTERN.test(value);
  }

  private isOptionalTimestamp(value: unknown): value is number | undefined {
    return (
      value === undefined ||
      (typeof value === 'number' && Number.isFinite(value))
    );
  }

  private isNumericDate(value: unknown): value is number {
    return (
      typeof value === 'number' &&
      Number.isInteger(value) &&
      Number.isFinite(value)
    );
  }

  private invalidToken(): DomainException {
    return new DomainException(
      ApiErrorCode.AUTH_TOKEN_INVALID,
      HttpStatus.UNAUTHORIZED,
      'Authentication is required',
    );
  }
}
