import { ConfigService } from '@nestjs/config';
import type { EntityManager, Repository } from 'typeorm';

import { PasswordResetAuthorization } from './entities/password-reset-authorization.entity';
import { PasswordResetAuthorizationService } from './password-reset-authorization.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2030-08-01T00:00:00.000Z');

describe('PasswordResetAuthorizationService', () => {
  let repository: jest.Mocked<
    Pick<Repository<PasswordResetAuthorization>, 'create' | 'save' | 'findOne'>
  >;
  let manager: EntityManager;
  let service: PasswordResetAuthorizationService;

  beforeEach(() => {
    repository = {
      create: jest.fn(
        (value) => value as PasswordResetAuthorization,
      ) as unknown as jest.Mocked<
        Pick<Repository<PasswordResetAuthorization>, 'create'>
      >['create'],
      save: jest.fn((value) =>
        Promise.resolve(value as PasswordResetAuthorization),
      ),
      findOne: jest.fn(),
    };
    manager = {
      getRepository: jest.fn(() => repository),
    } as unknown as EntityManager;
    service = new PasswordResetAuthorizationService({
      getOrThrow: jest.fn((name: string) => {
        if (name === 'PASSWORD_RESET_TOKEN_TTL_SECONDS') return 900;
        throw new Error(`Unexpected config key ${name}`);
      }),
    } as unknown as ConfigService);
  });

  it('returns a secure opaque token once and persists only its SHA-256 hash', async () => {
    const generated = await service.createAuthorization(USER_ID, manager, NOW);

    expect(generated.resetToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generated.expiresInSeconds).toBe(900);
    expect(generated.expiresAt).toEqual(new Date(NOW.getTime() + 900_000));
    const persisted = repository.create.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(persisted.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(persisted).not.toHaveProperty('resetToken');
    expect(persisted.tokenHash).not.toBe(generated.resetToken);
  });

  it.each([
    [null, 'invalid'],
    [{ usedAt: NOW, expiresAt: new Date(NOW.getTime() + 1_000) }, 'used'],
    [{ usedAt: null, expiresAt: NOW }, 'expired'],
  ] as const)('returns %s records as %s', async (record, expectedKind) => {
    repository.findOne.mockResolvedValue(record);

    await expect(
      service.validateLockedAuthorization('a'.repeat(43), manager, NOW),
    ).resolves.toEqual({ kind: expectedKind });
  });

  it('locks and resolves a valid stored authorization by the submitted token hash', async () => {
    const authorization = {
      id: 'authorization-id',
      userId: USER_ID,
      usedAt: null,
      expiresAt: new Date(NOW.getTime() + 1_000),
    } as PasswordResetAuthorization;
    repository.findOne.mockResolvedValue(authorization);

    await expect(
      service.validateLockedAuthorization('a'.repeat(43), manager, NOW),
    ).resolves.toEqual({ kind: 'valid', authorization });
    expect(repository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
  });

  it('marks a valid authorization used inside the caller transaction', async () => {
    const authorization = {
      usedAt: null,
    } as PasswordResetAuthorization;

    await service.consumeAuthorization(authorization, manager, NOW);

    expect(authorization.usedAt).toBe(NOW);
    expect(repository.save).toHaveBeenCalledWith(authorization);
  });
});
