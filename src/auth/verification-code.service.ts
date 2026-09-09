import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomInt } from 'node:crypto';
import { EntityManager, Repository } from 'typeorm';

import { AuthHashingService } from './auth-hashing.service';
import { VerificationCode } from './entities/verification-code.entity';
import { VerificationPurpose } from './enums/verification-purpose.enum';

export interface CreateVerificationCodeInput {
  userId: string;
  destination: string;
  purpose: VerificationPurpose;
}

export interface GeneratedVerificationCode {
  code: string;
  expiresAt: Date;
}

export type VerificationCodeValidationOutcome =
  | { kind: 'valid'; verificationCode: VerificationCode }
  | { kind: 'invalid' | 'expired' | 'attempts-exceeded' };

@Injectable()
export class VerificationCodeService {
  constructor(
    @InjectRepository(VerificationCode)
    private readonly verificationCodes: Repository<VerificationCode>,
    private readonly hashingService: AuthHashingService,
    private readonly configService: ConfigService,
  ) {}

  async createCode(
    input: CreateVerificationCodeInput,
    manager?: EntityManager,
    now = new Date(),
  ): Promise<GeneratedVerificationCode> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const expiresAt = new Date(
      now.getTime() + this.getTtlSeconds(input.purpose) * 1_000,
    );
    const verificationCode = this.repository(manager).create({
      userId: input.userId,
      destination: input.destination,
      purpose: input.purpose,
      codeHash: await this.hashingService.hashSecret(code),
      expiresAt,
      usedAt: null,
      attemptCount: 0,
    });

    await this.repository(manager).save(verificationCode);

    return { code, expiresAt };
  }

  async validateLockedCode(
    userId: string,
    destination: string,
    purpose: VerificationPurpose,
    submittedCode: string,
    manager: EntityManager,
    now = new Date(),
  ): Promise<VerificationCodeValidationOutcome> {
    const verificationCode = await manager
      .getRepository(VerificationCode)
      .findOne({
        where: { userId, destination, purpose },
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

    if (verificationCode === null || verificationCode.usedAt !== null) {
      return { kind: 'invalid' };
    }

    if (verificationCode.expiresAt <= now) {
      return { kind: 'expired' };
    }

    if (verificationCode.attemptCount >= this.getMaxAttempts()) {
      return { kind: 'attempts-exceeded' };
    }

    const matches = await this.hashingService.verifySecret(
      verificationCode.codeHash,
      submittedCode,
    );

    if (!matches) {
      verificationCode.attemptCount += 1;
      await manager.getRepository(VerificationCode).save(verificationCode);
      return { kind: 'invalid' };
    }

    return { kind: 'valid', verificationCode };
  }

  async consumeCode(
    verificationCode: VerificationCode,
    manager: EntityManager,
    now = new Date(),
  ): Promise<VerificationCode> {
    verificationCode.usedAt = now;

    return manager.getRepository(VerificationCode).save(verificationCode);
  }

  private repository(manager?: EntityManager): Repository<VerificationCode> {
    return manager?.getRepository(VerificationCode) ?? this.verificationCodes;
  }

  getTtlSeconds(purpose: VerificationPurpose): number {
    if (purpose === VerificationPurpose.RESET_PASSWORD) {
      return this.configService.getOrThrow<number>(
        'PASSWORD_RESET_OTP_TTL_SECONDS',
      );
    }

    if (purpose === VerificationPurpose.REGISTER_ACCOUNT) {
      return this.configService.getOrThrow<number>(
        'REGISTRATION_OTP_TTL_SECONDS',
      );
    }

    return this.configService.getOrThrow<number>(
      'VERIFICATION_CODE_TTL_SECONDS',
    );
  }

  private getMaxAttempts(): number {
    return this.configService.getOrThrow<number>(
      'VERIFICATION_CODE_MAX_ATTEMPTS',
    );
  }
}
