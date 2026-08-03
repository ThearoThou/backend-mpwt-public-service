import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { EntityManager, IsNull, Repository } from 'typeorm';

import { RefreshSession } from './entities/refresh-session.entity';

export const REFRESH_SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;

export const RefreshSessionRevocationReason = {
  LOGOUT: 'LOGOUT',
  TOKEN_REUSE: 'TOKEN_REUSE',
  PASSWORD_RESET: 'PASSWORD_RESET',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
} as const;

export type RefreshSessionRevocationReason =
  (typeof RefreshSessionRevocationReason)[keyof typeof RefreshSessionRevocationReason];

export class RefreshSessionDraft {
  private constructor(
    readonly id: string,
    readonly userId: string,
    private readonly expiresAtMilliseconds: number,
  ) {}

  static create(userId: string, now = new Date()): RefreshSessionDraft {
    return new RefreshSessionDraft(
      randomUUID(),
      userId,
      now.getTime() + REFRESH_SESSION_LIFETIME_MS,
    );
  }

  get expiresAt(): Date {
    return new Date(this.expiresAtMilliseconds);
  }
}

export interface PersistRefreshSessionInput {
  draft: RefreshSessionDraft;
  tokenHash: string;
}

@Injectable()
export class RefreshSessionService {
  constructor(
    @InjectRepository(RefreshSession)
    private readonly refreshSessions: Repository<RefreshSession>,
  ) {}

  createSessionDraft(userId: string, now = new Date()): RefreshSessionDraft {
    return RefreshSessionDraft.create(userId, now);
  }

  async persistSession(
    input: PersistRefreshSessionInput,
    manager?: EntityManager,
  ): Promise<RefreshSession> {
    const expiresAt = input.draft.expiresAt;
    const session = this.repository(manager).create({
      id: input.draft.id,
      userId: input.draft.userId,
      tokenHash: input.tokenHash,
      expiresAt: new Date(expiresAt.getTime()),
      lastUsedAt: null,
      revokedAt: null,
      revocationReason: null,
      reuseDetectedAt: null,
    });

    return this.repository(manager).save(session);
  }

  async findLockedSessionForRefresh(
    sessionId: string,
    manager: EntityManager,
  ): Promise<RefreshSession | null> {
    return manager.getRepository(RefreshSession).findOne({
      where: { id: sessionId },
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
  }

  async validateActiveSessionForUser(
    sessionId: string,
    userId: string,
    manager?: EntityManager,
    now = new Date(),
  ): Promise<RefreshSession | null> {
    const session = await this.repository(manager).findOne({
      where: { id: sessionId, userId },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        revokedAt: true,
      },
    });

    return this.isActive(session, now) ? session : null;
  }

  async sessionBelongsToUser(
    sessionId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    const session = await this.repository(manager).findOneBy({
      id: sessionId,
      userId,
    });

    return session !== null;
  }

  async rotateTokenHash(
    session: RefreshSession,
    tokenHash: string,
    manager?: EntityManager,
    now = new Date(),
  ): Promise<RefreshSession | null> {
    if (!this.isActive(session, now)) {
      return null;
    }

    session.tokenHash = tokenHash;
    session.lastUsedAt = now;

    return this.repository(manager).save(session);
  }

  async revokeLockedSession(
    session: RefreshSession,
    reason: RefreshSessionRevocationReason,
    manager: EntityManager,
    now = new Date(),
  ): Promise<RefreshSession | null> {
    if (!this.isActive(session, now)) {
      return null;
    }

    session.revokedAt = now;
    session.revocationReason = reason;

    return manager.getRepository(RefreshSession).save(session);
  }

  async markLockedTokenReuseAndRevoke(
    session: RefreshSession,
    manager: EntityManager,
    now = new Date(),
  ): Promise<RefreshSession> {
    session.reuseDetectedAt = now;
    session.revokedAt ??= now;
    session.revocationReason ??= RefreshSessionRevocationReason.TOKEN_REUSE;

    return manager.getRepository(RefreshSession).save(session);
  }

  async revokeCurrentSession(
    sessionId: string,
    userId: string,
    reason: RefreshSessionRevocationReason,
    manager?: EntityManager,
    now = new Date(),
  ): Promise<RefreshSession | null> {
    const session = await this.repository(manager).findOneBy({
      id: sessionId,
      userId,
    });

    if (!this.isActive(session, now)) {
      return null;
    }

    session.revokedAt = now;
    session.revocationReason = reason;

    return this.repository(manager).save(session);
  }

  async revokeAllActiveSessions(
    userId: string,
    reason: RefreshSessionRevocationReason,
    manager?: EntityManager,
    now = new Date(),
  ): Promise<number> {
    const sessions = await this.repository(manager).findBy({
      userId,
      revokedAt: IsNull(),
    });
    const activeSessions = sessions.filter((session) =>
      this.isActive(session, now),
    );

    if (activeSessions.length === 0) {
      return 0;
    }

    for (const session of activeSessions) {
      session.revokedAt = now;
      session.revocationReason = reason;
    }

    await this.repository(manager).save(activeSessions);

    return activeSessions.length;
  }

  async revokeAllActiveSessionsLocked(
    userId: string,
    reason: RefreshSessionRevocationReason,
    manager: EntityManager,
    now = new Date(),
  ): Promise<number> {
    const repository = manager.getRepository(RefreshSession);
    const sessions = await repository.find({
      where: { userId, revokedAt: IsNull() },
      lock: { mode: 'pessimistic_write' },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        revokedAt: true,
        revocationReason: true,
      },
    });
    const activeSessions = sessions.filter((session) =>
      this.isActive(session, now),
    );

    if (activeSessions.length === 0) {
      return 0;
    }

    for (const session of activeSessions) {
      session.revokedAt = now;
      session.revocationReason = reason;
    }

    await repository.save(activeSessions);

    return activeSessions.length;
  }

  async markTokenReuseAndRevoke(
    sessionId: string,
    userId: string,
    manager?: EntityManager,
    now = new Date(),
  ): Promise<RefreshSession | null> {
    const session = await this.repository(manager).findOneBy({
      id: sessionId,
      userId,
    });

    if (session === null) {
      return null;
    }

    session.reuseDetectedAt = now;
    session.revokedAt ??= now;
    session.revocationReason ??= RefreshSessionRevocationReason.TOKEN_REUSE;

    return this.repository(manager).save(session);
  }

  private repository(manager?: EntityManager): Repository<RefreshSession> {
    return manager?.getRepository(RefreshSession) ?? this.refreshSessions;
  }

  private isActive(
    session: RefreshSession | null,
    now: Date,
  ): session is RefreshSession {
    return (
      session !== null && session.revokedAt === null && session.expiresAt > now
    );
  }
}
