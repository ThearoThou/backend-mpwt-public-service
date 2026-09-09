import { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';

import { AuthHashingService } from './auth-hashing.service';
import { VerificationCode } from './entities/verification-code.entity';
import { VerificationPurpose } from './enums/verification-purpose.enum';
import { VerificationCodeService } from './verification-code.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2030-08-01T00:00:00.000Z');

function createConfigService(): ConfigService {
  return {
    getOrThrow: jest.fn((name: string) => {
      if (name === 'VERIFICATION_CODE_TTL_SECONDS') {
        return 300;
      }

      if (name === 'REGISTRATION_OTP_TTL_SECONDS') {
        return 120;
      }

      if (name === 'PASSWORD_RESET_OTP_TTL_SECONDS') {
        return 120;
      }

      if (name === 'VERIFICATION_CODE_MAX_ATTEMPTS') {
        return 5;
      }

      throw new Error(`Unexpected config key ${name}`);
    }),
  } as unknown as ConfigService;
}

function createCode(
  overrides: Partial<VerificationCode> = {},
): VerificationCode {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    userId: USER_ID,
    destination: '+85512345678',
    purpose: VerificationPurpose.REGISTER_ACCOUNT,
    codeHash: 'stored-hash',
    expiresAt: new Date(NOW.getTime() + 120_000),
    usedAt: null,
    attemptCount: 0,
    createdAt: NOW,
    user: null,
    ...overrides,
  };
}

describe('VerificationCodeService', () => {
  let repository: jest.Mocked<
    Pick<Repository<VerificationCode>, 'create' | 'save'>
  >;
  let hashing: jest.Mocked<
    Pick<AuthHashingService, 'hashSecret' | 'verifySecret'>
  >;
  let service: VerificationCodeService;

  beforeEach(() => {
    repository = {
      create: jest.fn((value) => value as VerificationCode),
      save: jest.fn((value) => Promise.resolve(value as VerificationCode)),
    };
    hashing = {
      hashSecret: jest.fn().mockResolvedValue('stored-hash'),
      verifySecret: jest.fn(),
    };
    service = new VerificationCodeService(
      repository as unknown as Repository<VerificationCode>,
      hashing,
      createConfigService(),
    );
  });

  it('generates and persists only a six-digit code hash with the configured expiry', async () => {
    const generated = await service.createCode(
      {
        userId: USER_ID,
        destination: '+85512345678',
        purpose: VerificationPurpose.REGISTER_ACCOUNT,
      },
      undefined,
      NOW,
    );

    expect(generated.code).toMatch(/^\d{6}$/);
    expect(generated.expiresAt).toEqual(new Date(NOW.getTime() + 120_000));
    expect(hashing.hashSecret).toHaveBeenCalledWith(generated.code);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        destination: '+85512345678',
        purpose: VerificationPurpose.REGISTER_ACCOUNT,
        codeHash: 'stored-hash',
      }),
    );
    expect(repository.create.mock.calls[0]?.[0]).not.toHaveProperty('code');
  });

  it('keeps registration and password-reset lifetimes purpose-specific', async () => {
    const generated = await service.createCode(
      {
        userId: USER_ID,
        destination: '+85512345678',
        purpose: VerificationPurpose.RESET_PASSWORD,
      },
      undefined,
      NOW,
    );

    expect(generated.expiresAt).toEqual(new Date(NOW.getTime() + 120_000));
    expect(service.getTtlSeconds(VerificationPurpose.RESET_PASSWORD)).toBe(120);
    expect(service.getTtlSeconds(VerificationPurpose.REGISTER_ACCOUNT)).toBe(
      120,
    );
    expect(service.getTtlSeconds(VerificationPurpose.CHANGE_PHONE)).toBe(300);
  });

  it('locks the latest code and commits a failed attempt before returning invalid', async () => {
    const verificationCode = createCode();
    const lockedRepository = {
      findOne: jest.fn().mockResolvedValue(verificationCode),
      save: jest.fn().mockResolvedValue(verificationCode),
    };
    const manager = {
      getRepository: jest.fn(() => lockedRepository),
    };
    hashing.verifySecret.mockResolvedValue(false);

    await expect(
      service.validateLockedCode(
        USER_ID,
        '+85512345678',
        VerificationPurpose.REGISTER_ACCOUNT,
        '000000',
        manager as never,
        NOW,
      ),
    ).resolves.toEqual({ kind: 'invalid' });

    expect(lockedRepository.findOne).toHaveBeenCalledWith({
      where: {
        userId: USER_ID,
        destination: '+85512345678',
        purpose: VerificationPurpose.REGISTER_ACCOUNT,
      },
      order: { createdAt: 'DESC' },
      lock: { mode: 'pessimistic_write' },
      select: {
        id: true,
        userId: true,
        destination: true,
        purpose: true,
        codeHash: true,
        expiresAt: true,
        usedAt: true,
        attemptCount: true,
        createdAt: true,
      },
    });
    expect(verificationCode.attemptCount).toBe(1);
    expect(lockedRepository.save).toHaveBeenCalledWith(verificationCode);
  });

  it('distinguishes expired and exhausted codes without checking a hash', async () => {
    const lockedRepository = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(createCode({ expiresAt: NOW }))
        .mockResolvedValueOnce(createCode({ attemptCount: 5 })),
      save: jest.fn(),
    };
    const manager = { getRepository: jest.fn(() => lockedRepository) };

    await expect(
      service.validateLockedCode(
        USER_ID,
        '+85512345678',
        VerificationPurpose.REGISTER_ACCOUNT,
        '000000',
        manager as never,
        NOW,
      ),
    ).resolves.toEqual({ kind: 'expired' });
    await expect(
      service.validateLockedCode(
        USER_ID,
        '+85512345678',
        VerificationPurpose.REGISTER_ACCOUNT,
        '000000',
        manager as never,
        NOW,
      ),
    ).resolves.toEqual({ kind: 'attempts-exceeded' });
    expect(hashing.verifySecret).not.toHaveBeenCalled();
  });

  it('rejects a consumed code without checking its hash again', async () => {
    const lockedRepository = {
      findOne: jest.fn().mockResolvedValue(createCode({ usedAt: NOW })),
      save: jest.fn(),
    };
    const manager = { getRepository: jest.fn(() => lockedRepository) };

    await expect(
      service.validateLockedCode(
        USER_ID,
        '+85512345678',
        VerificationPurpose.RESET_PASSWORD,
        '012345',
        manager as never,
        new Date(NOW.getTime() - 1_000),
      ),
    ).resolves.toEqual({ kind: 'invalid' });
    expect(hashing.verifySecret).not.toHaveBeenCalled();
  });
});
