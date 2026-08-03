import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

import { AuthHashingService } from './auth-hashing.service';
import {
  IdentifierNormalizationError,
  normalizeCambodianPhone,
  normalizeEmail,
} from './identifier-normalization';
import { UsersService } from '../users/users.service';

interface BootstrapAdministratorConfiguration {
  phone: string | null;
  email: string;
  password: string;
}

@Injectable()
export class AdminBootstrapService {
  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly usersService: UsersService,
    private readonly hashingService: AuthHashingService,
  ) {}

  async bootstrapInitialAdministrator(): Promise<void> {
    if (!this.configService.getOrThrow<boolean>('ADMIN_BOOTSTRAP_ENABLED')) {
      return;
    }

    const configuration = this.readConfiguration();

    try {
      await this.dataSource.transaction(async (manager) => {
        if (
          (await this.usersService.findInitialAdministrator(manager)) !== null
        ) {
          return;
        }

        if (
          await this.usersService.hasIdentifierConflict(
            configuration.phone,
            configuration.email,
            manager,
          )
        ) {
          throw new BootstrapIdentifierConflictError();
        }

        await this.usersService.createInitialAdministrator(
          {
            phone: configuration.phone,
            email: configuration.email,
            passwordHash: await this.hashingService.hashSecret(
              configuration.password,
            ),
          },
          manager,
        );
      });
    } catch (error) {
      if (
        error instanceof BootstrapIdentifierConflictError ||
        this.isUniqueConstraintViolation(error)
      ) {
        throw new Error(
          'Initial administrator bootstrap could not be completed.',
        );
      }

      throw error;
    }
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
      return false;
    }

    const databaseError = error as {
      code?: unknown;
      driverError?: { code?: unknown };
    };

    return (
      databaseError.code === '23505' ||
      databaseError.driverError?.code === '23505'
    );
  }

  private readConfiguration(): BootstrapAdministratorConfiguration {
    const phone = this.configService.get<string>('ADMIN_BOOTSTRAP_PHONE');
    const email = this.configService.getOrThrow<string>(
      'ADMIN_BOOTSTRAP_EMAIL',
    );
    const password = this.configService.getOrThrow<string>(
      'ADMIN_BOOTSTRAP_PASSWORD',
    );

    try {
      return {
        phone: phone === undefined ? null : normalizeCambodianPhone(phone),
        email: normalizeEmail(email),
        password,
      };
    } catch (error) {
      if (error instanceof IdentifierNormalizationError) {
        throw new Error(
          'Initial administrator bootstrap configuration is invalid.',
        );
      }

      throw error;
    }
  }
}

class BootstrapIdentifierConflictError extends Error {}
