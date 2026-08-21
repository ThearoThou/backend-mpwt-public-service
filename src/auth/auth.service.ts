import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { DataSource, EntityManager } from 'typeorm';

import {
  AuthTokenResponse,
  createRegistrationResponse,
  mapUserSummary,
  RegistrationResponse,
} from './auth-response.mapper';
import { AuthHashingService } from './auth-hashing.service';
import { AuthTokenService } from './auth-token.service';
import {
  LoginRequestDto,
  PasswordResetConfirmRequestDto,
  PasswordResetRequestDto,
  PasswordResetVerifyRequestDto,
  RegisterRequestDto,
  ResendVerificationRequestDto,
  VerifyAccountRequestDto,
} from './dto/auth-request.dtos';
import {
  IdentifierNormalizationError,
  normalizeIdentifier,
  normalizeRegistrationIdentifiers,
} from './identifier-normalization';
import {
  RefreshSessionRevocationReason,
  RefreshSessionService,
} from './refresh-session.service';
import {
  VerificationCodeService,
  type VerificationCodeValidationOutcome,
} from './verification-code.service';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { UsersService } from '../users/users.service';
import { VerificationPurpose } from './enums/verification-purpose.enum';

export interface AuthenticatedWorkflowResult {
  response: AuthTokenResponse;
  refreshToken: string;
  refreshExpiresAt: Date;
}

type RegistrationUniqueConflict = 'identifier' | 'other';

@Injectable()
export class AuthService {
  private dummyPasswordHash: Promise<string> | undefined;

  constructor(
    private readonly dataSource: DataSource,
    private readonly usersService: UsersService,
    private readonly verificationCodeService: VerificationCodeService,
    private readonly hashingService: AuthHashingService,
    private readonly authTokenService: AuthTokenService,
    private readonly refreshSessionService: RefreshSessionService,
    private readonly configService: ConfigService,
  ) {}

  async register(input: RegisterRequestDto): Promise<RegistrationResponse> {
    const identifiers = this.normalizeRegistrationIdentifiers(input);
    const now = new Date();

    try {
      return await this.dataSource.transaction(async (manager) => {
        if (
          await this.usersService.hasIdentifierConflict(
            identifiers.phone,
            identifiers.email,
            manager,
          )
        ) {
          throw this.identifierConflict();
        }

        const user = await this.usersService.createPendingCitizen(
          {
            phone: identifiers.phone,
            email: identifiers.email,
            passwordHash: await this.hashingService.hashSecret(input.password),
            nameKh: input.nameKh,
            nameEn: input.nameEn,
            nationalIdNumber: input.nationalIdNumber,
            address: input.address,
          },
          manager,
        );
        const generatedCode = await this.verificationCodeService.createCode(
          {
            userId: user.id,
            destination: identifiers.verificationIdentifier,
            purpose: VerificationPurpose.REGISTER_ACCOUNT,
          },
          manager,
          now,
        );

        return createRegistrationResponse({
          destination: identifiers.verificationIdentifier,
          developmentCode: this.exposedDevelopmentCode(generatedCode.code),
        });
      });
    } catch (error) {
      const conflict = this.classifyRegistrationUniqueViolation(error);

      if (conflict === 'identifier') {
        throw this.identifierConflict();
      }

      if (conflict === 'other') {
        throw this.registrationConflict();
      }

      throw error;
    }
  }

  async verifyAccount(
    input: VerifyAccountRequestDto,
  ): Promise<AuthenticatedWorkflowResult> {
    const identifier = this.normalizeIdentifier(input.identifier);
    const now = new Date();
    const outcome = await this.dataSource.transaction(async (manager) => {
      const user = await this.usersService.findLockedUserByIdentifier(
        identifier,
        manager,
      );

      if (
        user === null ||
        user.role !== UserRole.CITIZEN ||
        user.status !== UserStatus.PENDING_VERIFICATION
      ) {
        return { kind: 'invalid' } as const;
      }

      const validation = await this.verificationCodeService.validateLockedCode(
        user.id,
        identifier,
        VerificationPurpose.REGISTER_ACCOUNT,
        input.code,
        manager,
        now,
      );

      if (validation.kind !== 'valid') {
        return validation;
      }

      const activatedUser =
        await this.usersService.activateCitizenForIdentifier(
          user,
          identifier,
          manager,
          now,
        );

      if (activatedUser === null) {
        return { kind: 'invalid' } as const;
      }

      await this.verificationCodeService.consumeCode(
        validation.verificationCode,
        manager,
        now,
      );

      return {
        kind: 'success' as const,
        result: await this.createSessionTokens(activatedUser, manager, now),
      };
    });

    if (outcome.kind !== 'success') {
      throw this.verificationOutcomeException(outcome);
    }

    return outcome.result;
  }

  async resendVerification(
    input: ResendVerificationRequestDto,
  ): Promise<RegistrationResponse> {
    const identifier = this.normalizeIdentifier(input.identifier);
    const user = await this.usersService.findUserByIdentifier(identifier);

    if (
      user === null ||
      user.role !== UserRole.CITIZEN ||
      user.status !== UserStatus.PENDING_VERIFICATION
    ) {
      return createRegistrationResponse();
    }

    const generatedCode = await this.verificationCodeService.createCode({
      userId: user.id,
      destination: identifier,
      purpose: VerificationPurpose.REGISTER_ACCOUNT,
    });

    return createRegistrationResponse({
      developmentCode: this.exposedDevelopmentCode(generatedCode.code),
    });
  }

  async login(input: LoginRequestDto): Promise<AuthenticatedWorkflowResult> {
    const identifier = this.normalizeIdentifier(input.identifier);
    const now = new Date();

    return this.dataSource.transaction(async (manager) => {
      const user = await this.usersService.findUserForLogin(
        identifier,
        manager,
      );
      const passwordHash =
        user?.passwordHash ?? (await this.getDummyPasswordHash());
      const passwordMatches = await this.hashingService.verifySecret(
        passwordHash,
        input.password,
      );

      if (user === null || !passwordMatches) {
        throw this.invalidCredentials();
      }

      this.requireActiveLoginUser(user);
      const loggedInUser = await this.usersService.recordLogin(
        user,
        manager,
        now,
      );

      return this.createSessionTokens(loggedInUser, manager, now);
    });
  }

  async requestPasswordReset(
    input: PasswordResetRequestDto,
  ): Promise<RegistrationResponse> {
    const identifier = this.normalizeIdentifier(input.identifier);
    const user = await this.usersService.findUserByIdentifier(identifier);

    if (user === null) {
      return createRegistrationResponse();
    }

    const generatedCode = await this.verificationCodeService.createCode({
      userId: user.id,
      destination: identifier,
      purpose: VerificationPurpose.RESET_PASSWORD,
    });

    return createRegistrationResponse({
      developmentCode: this.exposedDevelopmentCode(generatedCode.code),
      purpose: VerificationPurpose.RESET_PASSWORD,
    });
  }

  async confirmPasswordReset(
    input: PasswordResetConfirmRequestDto,
  ): Promise<RegistrationResponse> {
    const identifier = this.normalizeIdentifier(input.identifier);
    const now = new Date();
    const outcome = await this.dataSource.transaction(async (manager) => {
      const user = await this.usersService.findLockedUserByIdentifier(
        identifier,
        manager,
      );

      if (user === null) {
        return { kind: 'invalid' } as const;
      }

      const validation = await this.verificationCodeService.validateLockedCode(
        user.id,
        identifier,
        VerificationPurpose.RESET_PASSWORD,
        input.code,
        manager,
        now,
      );

      if (validation.kind !== 'valid') {
        return validation;
      }

      await this.usersService.replacePassword(
        user,
        await this.hashingService.hashSecret(input.newPassword),
        manager,
      );
      await this.verificationCodeService.consumeCode(
        validation.verificationCode,
        manager,
        now,
      );
      await this.refreshSessionService.revokeAllActiveSessions(
        user.id,
        RefreshSessionRevocationReason.PASSWORD_RESET,
        manager,
        now,
      );

      return { kind: 'success' } as const;
    });

    if (outcome.kind !== 'success') {
      throw this.verificationOutcomeException(outcome);
    }

    return createRegistrationResponse({
      verificationRequired: false,
      message: 'Password has been reset successfully.',
    });
  }

  async verifyPasswordReset(
    input: PasswordResetVerifyRequestDto,
  ): Promise<RegistrationResponse> {
    const identifier = this.normalizeIdentifier(input.identifier);
    const now = new Date();
    const outcome = await this.dataSource.transaction(async (manager) => {
      const user = await this.usersService.findLockedUserByIdentifier(
        identifier,
        manager,
      );

      if (user === null) {
        return { kind: 'invalid' } as const;
      }

      return this.verificationCodeService.validateLockedCode(
        user.id,
        identifier,
        VerificationPurpose.RESET_PASSWORD,
        input.code,
        manager,
        now,
      );
    });

    if (outcome.kind !== 'valid') {
      throw this.verificationOutcomeException(outcome);
    }

    return createRegistrationResponse({
      verificationRequired: false,
      message: 'Verification code is valid.',
    });
  }

  async refresh(
    refreshToken: string | undefined,
  ): Promise<AuthenticatedWorkflowResult> {
    if (refreshToken === undefined) {
      throw this.invalidToken();
    }

    const claims = await this.authTokenService.verifyRefreshToken(refreshToken);
    const now = new Date();
    const outcome = await this.dataSource.transaction(async (manager) => {
      const session =
        await this.refreshSessionService.findLockedSessionForRefresh(
          claims.sid,
          manager,
        );

      if (
        session === null ||
        session.userId !== claims.sub ||
        session.revokedAt !== null ||
        session.expiresAt <= now
      ) {
        return { kind: 'invalid' } as const;
      }

      const user = await this.usersService.findUserByIdForRefresh(
        claims.sub,
        manager,
      );

      if (user === null || !this.isTokenIssuingRole(user)) {
        return { kind: 'invalid' } as const;
      }

      if (user.status === UserStatus.DISABLED) {
        return { kind: 'disabled' } as const;
      }

      if (user.status !== UserStatus.ACTIVE) {
        return { kind: 'invalid' } as const;
      }

      if (
        !(await this.hashingService.verifySecret(
          session.tokenHash,
          refreshToken,
        ))
      ) {
        await this.refreshSessionService.markLockedTokenReuseAndRevoke(
          session,
          manager,
          now,
        );
        return { kind: 'invalid' } as const;
      }

      const rotatedRefreshToken = await this.authTokenService.signRefreshToken(
        {
          userId: user.id,
          sessionId: session.id,
          expiresAt: session.expiresAt,
        },
        now,
      );
      const rotatedSession = await this.refreshSessionService.rotateTokenHash(
        session,
        await this.hashingService.hashSecret(rotatedRefreshToken.token),
        manager,
        now,
      );

      if (rotatedSession === null) {
        return { kind: 'invalid' } as const;
      }

      const accessToken = await this.authTokenService.signAccessToken(
        {
          userId: user.id,
          role: user.role,
          sessionId: session.id,
          expiresAt: session.expiresAt,
        },
        now,
      );

      return {
        kind: 'success' as const,
        result: {
          response: {
            accessToken: accessToken.token,
            tokenType: 'Bearer' as const,
            expiresIn: accessToken.expiresIn,
            user: mapUserSummary(user),
          },
          refreshToken: rotatedRefreshToken.token,
          refreshExpiresAt: new Date(session.expiresAt.getTime()),
        },
      };
    });

    if (outcome.kind === 'disabled') {
      throw this.accountDisabled();
    }

    if (outcome.kind !== 'success') {
      throw this.invalidToken();
    }

    return outcome.result;
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (refreshToken === undefined) {
      return;
    }

    let claims;
    try {
      claims = await this.authTokenService.verifyRefreshToken(refreshToken);
    } catch {
      return;
    }

    const now = new Date();
    await this.dataSource.transaction(async (manager) => {
      const session =
        await this.refreshSessionService.findLockedSessionForRefresh(
          claims.sid,
          manager,
        );

      if (
        session === null ||
        session.userId !== claims.sub ||
        !(await this.hashingService.verifySecret(
          session.tokenHash,
          refreshToken,
        ))
      ) {
        return;
      }

      await this.refreshSessionService.revokeLockedSession(
        session,
        RefreshSessionRevocationReason.LOGOUT,
        manager,
        now,
      );
    });
  }

  assertNoJsonBody(body: unknown, request: Pick<Request, 'headers'>): void {
    if (
      !this.requestHasTransmittedBody(request) &&
      (body === undefined ||
        (typeof body === 'object' &&
          body !== null &&
          !Array.isArray(body) &&
          Object.keys(body).length === 0))
    ) {
      return;
    }

    throw this.validationError('This endpoint does not accept a JSON body.');
  }

  private async createSessionTokens(
    user: User,
    manager: EntityManager,
    now: Date,
  ): Promise<AuthenticatedWorkflowResult> {
    if (!this.isTokenIssuingRole(user)) {
      throw this.accountNotActive();
    }

    const draft = this.refreshSessionService.createSessionDraft(user.id, now);
    const refreshToken = await this.authTokenService.signRefreshToken(
      {
        userId: user.id,
        sessionId: draft.id,
        expiresAt: draft.expiresAt,
      },
      now,
    );
    await this.refreshSessionService.persistSession(
      {
        draft,
        tokenHash: await this.hashingService.hashSecret(refreshToken.token),
      },
      manager,
    );
    const accessToken = await this.authTokenService.signAccessToken(
      {
        userId: user.id,
        role: user.role,
        sessionId: draft.id,
        expiresAt: draft.expiresAt,
      },
      now,
    );

    return {
      response: {
        accessToken: accessToken.token,
        tokenType: 'Bearer',
        expiresIn: accessToken.expiresIn,
        user: mapUserSummary(user),
      },
      refreshToken: refreshToken.token,
      refreshExpiresAt: draft.expiresAt,
    };
  }

  private requireActiveLoginUser(user: User): void {
    if (user.status === UserStatus.DISABLED) {
      throw this.accountDisabled();
    }

    if (user.status !== UserStatus.ACTIVE || !this.isTokenIssuingRole(user)) {
      throw this.accountNotActive();
    }
  }

  private isTokenIssuingRole(
    user: User,
  ): user is User & { role: UserRole.CITIZEN | UserRole.ADMIN } {
    return user.role === UserRole.CITIZEN || user.role === UserRole.ADMIN;
  }

  private normalizeIdentifier(value: string): string {
    try {
      return normalizeIdentifier(value);
    } catch (error) {
      if (error instanceof IdentifierNormalizationError) {
        throw this.validationError('Identifier is invalid.');
      }

      throw error;
    }
  }

  private normalizeRegistrationIdentifiers(input: RegisterRequestDto) {
    try {
      return normalizeRegistrationIdentifiers(input);
    } catch (error) {
      if (error instanceof IdentifierNormalizationError) {
        throw this.validationError('Registration identifiers are invalid.');
      }

      throw error;
    }
  }

  private exposedDevelopmentCode(code: string): string | undefined {
    return this.configService.getOrThrow<string>('NODE_ENV') !== 'production' &&
      this.configService.getOrThrow<boolean>(
        'EXPOSE_DEVELOPMENT_VERIFICATION_CODE',
      )
      ? code
      : undefined;
  }

  private getDummyPasswordHash(): Promise<string> {
    this.dummyPasswordHash ??= this.hashingService.hashSecret(randomUUID());

    return this.dummyPasswordHash;
  }

  private requestHasTransmittedBody(
    request: Pick<Request, 'headers'>,
  ): boolean {
    const contentLength = request.headers['content-length'];
    const contentLengthValue =
      typeof contentLength === 'string' ? contentLength : undefined;

    if (
      contentLengthValue !== undefined &&
      Number.isFinite(Number(contentLengthValue)) &&
      Number(contentLengthValue) > 0
    ) {
      return true;
    }

    return request.headers['transfer-encoding'] !== undefined;
  }

  private verificationOutcomeException(
    outcome:
      | Exclude<VerificationCodeValidationOutcome, { kind: 'valid' }>
      | {
          kind: 'invalid';
        },
  ): DomainException {
    switch (outcome.kind) {
      case 'expired':
        return new DomainException(
          ApiErrorCode.AUTH_VERIFICATION_CODE_EXPIRED,
          HttpStatus.BAD_REQUEST,
          'Verification code has expired',
        );
      case 'attempts-exceeded':
        return new DomainException(
          ApiErrorCode.AUTH_VERIFICATION_ATTEMPTS_EXCEEDED,
          HttpStatus.TOO_MANY_REQUESTS,
          'Verification attempt limit has been reached',
        );
      default:
        return new DomainException(
          ApiErrorCode.AUTH_VERIFICATION_CODE_INVALID,
          HttpStatus.BAD_REQUEST,
          'Verification code is invalid',
        );
    }
  }

  private invalidCredentials(): DomainException {
    return new DomainException(
      ApiErrorCode.AUTH_INVALID_CREDENTIALS,
      HttpStatus.UNAUTHORIZED,
      'Invalid credentials',
    );
  }

  private accountNotActive(): DomainException {
    return new DomainException(
      ApiErrorCode.AUTH_ACCOUNT_NOT_ACTIVE,
      HttpStatus.FORBIDDEN,
      'Account is not active',
    );
  }

  private accountDisabled(): DomainException {
    return new DomainException(
      ApiErrorCode.AUTH_ACCOUNT_DISABLED,
      HttpStatus.FORBIDDEN,
      'Account is disabled',
    );
  }

  private invalidToken(): DomainException {
    return new DomainException(
      ApiErrorCode.AUTH_TOKEN_INVALID,
      HttpStatus.UNAUTHORIZED,
      'Authentication is required',
    );
  }

  private identifierConflict(): DomainException {
    return new DomainException(
      ApiErrorCode.USER_IDENTIFIER_CONFLICT,
      HttpStatus.CONFLICT,
      'Phone or email is already in use',
    );
  }

  private registrationConflict(): DomainException {
    return new DomainException(
      ApiErrorCode.CONFLICT,
      HttpStatus.CONFLICT,
      'Registration conflicts with an existing record',
    );
  }

  private validationError(message: string): DomainException {
    return new DomainException(
      ApiErrorCode.VALIDATION_ERROR,
      HttpStatus.BAD_REQUEST,
      message,
    );
  }

  private classifyRegistrationUniqueViolation(
    error: unknown,
  ): RegistrationUniqueConflict | undefined {
    if (typeof error !== 'object' || error === null) {
      return undefined;
    }

    const databaseError = error as {
      code?: unknown;
      constraint?: unknown;
      driverError?: { code?: unknown; constraint?: unknown };
    };
    const code = databaseError.code ?? databaseError.driverError?.code;
    const constraint =
      databaseError.constraint ?? databaseError.driverError?.constraint;

    if (code !== '23505') {
      return undefined;
    }

    if (
      constraint === 'UQ_a000cca60bcf04454e727699490' ||
      constraint === 'UQ_97672ac88f789774dd47f7c8be3'
    ) {
      return 'identifier';
    }

    if (constraint === 'UQ_aa30876112d7d4c1ab2d9e7c6c9') {
      return 'other';
    }

    return undefined;
  }
}
