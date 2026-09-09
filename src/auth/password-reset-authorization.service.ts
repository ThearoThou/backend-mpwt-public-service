import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { EntityManager } from 'typeorm';

import { PasswordResetAuthorization } from './entities/password-reset-authorization.entity';

export interface GeneratedPasswordResetAuthorization {
  resetToken: string;
  expiresAt: Date;
  expiresInSeconds: number;
}

export type PasswordResetAuthorizationValidationOutcome =
  | {
      kind: 'valid';
      authorization: PasswordResetAuthorization;
    }
  | { kind: 'invalid' | 'expired' | 'used' };

@Injectable()
export class PasswordResetAuthorizationService {
  constructor(private readonly configService: ConfigService) {}

  async createAuthorization(
    userId: string,
    manager: EntityManager,
    now = new Date(),
  ): Promise<GeneratedPasswordResetAuthorization> {
    const resetToken = randomBytes(32).toString('base64url');
    const expiresInSeconds = this.getTtlSeconds();
    const expiresAt = new Date(now.getTime() + expiresInSeconds * 1_000);
    const authorization = manager
      .getRepository(PasswordResetAuthorization)
      .create({
        userId,
        tokenHash: this.hashToken(resetToken),
        expiresAt,
        usedAt: null,
      });

    await manager.getRepository(PasswordResetAuthorization).save(authorization);

    return { resetToken, expiresAt, expiresInSeconds };
  }

  async validateLockedAuthorization(
    resetToken: string,
    manager: EntityManager,
    now = new Date(),
  ): Promise<PasswordResetAuthorizationValidationOutcome> {
    const authorization = await manager
      .getRepository(PasswordResetAuthorization)
      .findOne({
        where: { tokenHash: this.hashToken(resetToken) },
        lock: { mode: 'pessimistic_write' },
        select: {
          id: true,
          userId: true,
          tokenHash: true,
          expiresAt: true,
          usedAt: true,
          createdAt: true,
        },
      });

    if (authorization === null) {
      return { kind: 'invalid' };
    }

    if (authorization.usedAt !== null) {
      return { kind: 'used' };
    }

    if (authorization.expiresAt <= now) {
      return { kind: 'expired' };
    }

    return { kind: 'valid', authorization };
  }

  async consumeAuthorization(
    authorization: PasswordResetAuthorization,
    manager: EntityManager,
    now = new Date(),
  ): Promise<PasswordResetAuthorization> {
    authorization.usedAt = now;

    return manager
      .getRepository(PasswordResetAuthorization)
      .save(authorization);
  }

  getTtlSeconds(): number {
    return this.configService.getOrThrow<number>(
      'PASSWORD_RESET_TOKEN_TTL_SECONDS',
    );
  }

  private hashToken(resetToken: string): string {
    return createHash('sha256').update(resetToken).digest('hex');
  }
}
