import { HttpStatus, INestApplication, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { Request } from 'express';

import { AuthController } from '../src/auth/auth.controller';
import { RefreshCookieHelper } from '../src/auth/refresh-cookie.helper';
import { AuthService } from '../src/auth/auth.service';
import { configureApiApplication } from '../src/common/http/api-application.configuration';
import { ApiErrorCode } from '../src/common/errors/api-error-code';
import { DomainException } from '../src/common/errors/domain.exception';
import { UserRole } from '../src/users/enums/user-role.enum';
import { UserStatus } from '../src/users/enums/user-status.enum';

const NOW = new Date('2030-08-01T00:00:00.000Z');

@Module({
  controllers: [AuthController],
  providers: [AuthService, RefreshCookieHelper],
})
class AuthControllerE2eModule {}

describe('authentication controller (e2e)', () => {
  let app: INestApplication<App>;
  let authService: jest.Mocked<
    Pick<
      AuthService,
      | 'register'
      | 'login'
      | 'refresh'
      | 'logout'
      | 'assertNoJsonBody'
      | 'verifyAccount'
      | 'resendVerification'
      | 'requestPasswordReset'
      | 'verifyPasswordReset'
      | 'confirmPasswordReset'
    >
  >;
  let refreshCookieHelper: jest.Mocked<
    Pick<
      RefreshCookieHelper,
      'readRefreshToken' | 'setRefreshToken' | 'clearRefreshToken'
    >
  >;

  beforeEach(async () => {
    const authenticationResult = {
      response: {
        accessToken: 'access-token',
        tokenType: 'Bearer' as const,
        expiresIn: 1_800,
        user: {
          id: '11111111-1111-4111-8111-111111111111',
          phone: '+85512345678',
          email: null,
          role: UserRole.CITIZEN,
          status: UserStatus.ACTIVE,
          phoneVerifiedAt: NOW,
          emailVerifiedAt: null,
          createdAt: NOW,
          updatedAt: NOW,
        },
      },
      refreshToken: 'raw-refresh-token',
      refreshExpiresAt: new Date(NOW.getTime() + 604_800_000),
    };
    authService = {
      register: jest.fn().mockResolvedValue({
        message: 'Verification code created.',
        verificationRequired: true,
        destinationHint: '+855******678',
        expiresInSeconds: 120,
      }),
      verifyAccount: jest.fn(),
      resendVerification: jest.fn(),
      login: jest.fn().mockResolvedValue(authenticationResult),
      requestPasswordReset: jest.fn(),
      verifyPasswordReset: jest.fn().mockResolvedValue({
        resetToken: 'a'.repeat(43),
        expiresInSeconds: 900,
      }),
      confirmPasswordReset: jest.fn(),
      refresh: jest.fn().mockResolvedValue(authenticationResult),
      logout: jest.fn(),
      assertNoJsonBody: jest.fn(
        (body: unknown, request_: Pick<Request, 'headers'>) => {
          const contentLength = request_.headers['content-length'];
          const contentLengthValue =
            typeof contentLength === 'string' ? contentLength : undefined;
          const requestHasBody =
            (contentLengthValue !== undefined &&
              Number(contentLengthValue) > 0) ||
            request_.headers['transfer-encoding'] !== undefined;

          if (
            requestHasBody ||
            (body !== undefined &&
              (typeof body !== 'object' ||
                body === null ||
                Array.isArray(body) ||
                Object.keys(body).length !== 0))
          ) {
            throw new DomainException(
              ApiErrorCode.VALIDATION_ERROR,
              HttpStatus.BAD_REQUEST,
              'This endpoint does not accept a JSON body.',
            );
          }
        },
      ),
    };
    refreshCookieHelper = {
      readRefreshToken: jest.fn().mockReturnValue('cookie-refresh-token'),
      setRefreshToken: jest.fn(),
      clearRefreshToken: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AuthControllerE2eModule],
    })
      .overrideProvider(AuthService)
      .useValue(authService)
      .overrideProvider(RefreshCookieHelper)
      .useValue(refreshCookieHelper)
      .compile();

    app = moduleFixture.createNestApplication<App>();
    configureApiApplication(app, '/api');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('keeps registration under /api and rejects unknown or missing identifiers', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        phone: '012 345 678',
        password: 'password1',
        nameKh: 'ណាមខ្មែរ',
        nameEn: 'Citizen Name',
      })
      .expect(HttpStatus.CREATED)
      .expect({
        data: {
          message: 'Verification code created.',
          verificationRequired: true,
          destinationHint: '+855******678',
          expiresInSeconds: 120,
        },
      });

    const unknownField = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        phone: '012 345 678',
        password: 'password1',
        nameKh: 'ណាមខ្មែរ',
        nameEn: 'Citizen Name',
        purpose: 'REGISTER_ACCOUNT',
      })
      .expect(HttpStatus.BAD_REQUEST);
    const noIdentifier = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        password: 'password1',
        nameKh: 'ណាមខ្មែរ',
        nameEn: 'Citizen Name',
      })
      .expect(HttpStatus.BAD_REQUEST);

    expect((unknownField.body as { code: string }).code).toBe(
      ApiErrorCode.VALIDATION_ERROR,
    );
    expect((noIdentifier.body as { code: string }).code).toBe(
      ApiErrorCode.VALIDATION_ERROR,
    );
  });

  it('sets an internal refresh cookie while returning only AuthTokenResponse fields', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ identifier: '012345678', password: 'password1' })
      .expect(HttpStatus.OK);

    const body = response.body as { data: Record<string, unknown> };

    expect(body.data).toMatchObject({
      accessToken: 'access-token',
      tokenType: 'Bearer',
      expiresIn: 1_800,
    });
    expect(body.data).not.toHaveProperty('refreshToken');
    expect(body.data).not.toHaveProperty('sid');
    expect(refreshCookieHelper.setRefreshToken).toHaveBeenCalledWith(
      expect.anything(),
      'raw-refresh-token',
      expect.any(Date),
    );
  });

  it('accepts no body only, rejects JSON bodies, and clears cookies on rejected bodies', async () => {
    const noBodyRefresh = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .expect(HttpStatus.OK);
    const emptyRefresh = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({})
      .expect(HttpStatus.BAD_REQUEST);
    const refreshToken = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: 'client-supplied-token' })
      .expect(HttpStatus.BAD_REQUEST);
    const verificationPurpose = await request(app.getHttpServer())
      .post('/api/auth/verify')
      .send({
        identifier: '012345678',
        code: '012345',
        purpose: 'REGISTER_ACCOUNT',
      })
      .expect(HttpStatus.BAD_REQUEST);
    const emptyLogout = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .send({})
      .expect(HttpStatus.BAD_REQUEST);
    const logoutToken = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .send({ refreshToken: 'client-supplied-token' })
      .expect(HttpStatus.BAD_REQUEST);

    expect(
      (noBodyRefresh.body as { data: Record<string, unknown> }).data,
    ).toMatchObject({
      accessToken: 'access-token',
    });
    expect((emptyRefresh.body as { code: string }).code).toBe(
      ApiErrorCode.VALIDATION_ERROR,
    );
    expect((refreshToken.body as { code: string }).code).toBe(
      ApiErrorCode.VALIDATION_ERROR,
    );
    expect((verificationPurpose.body as { code: string }).code).toBe(
      ApiErrorCode.VALIDATION_ERROR,
    );
    expect((emptyLogout.body as { code: string }).code).toBe(
      ApiErrorCode.VALIDATION_ERROR,
    );
    expect((logoutToken.body as { code: string }).code).toBe(
      ApiErrorCode.VALIDATION_ERROR,
    );
    expect(authService.refresh).toHaveBeenCalledTimes(1);
    expect(authService.refresh).toHaveBeenCalledWith('cookie-refresh-token');
    expect(authService.verifyAccount).not.toHaveBeenCalled();
    expect(authService.logout).not.toHaveBeenCalled();
    expect(refreshCookieHelper.clearRefreshToken).toHaveBeenCalledTimes(4);
  });

  it('always clears the logout cookie and keeps invalid/missing cookies successful', async () => {
    refreshCookieHelper.readRefreshToken.mockReturnValue(undefined);

    const response = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .expect(HttpStatus.OK);

    expect(response.body).toEqual({
      data: { message: 'Logged out successfully.' },
    });
    expect(authService.logout).toHaveBeenCalledWith(undefined);
    expect(refreshCookieHelper.clearRefreshToken).toHaveBeenCalledTimes(1);
  });

  it('uses OTP only for verification and resetToken only for confirmation', async () => {
    authService.confirmPasswordReset.mockResolvedValue({
      message: 'Password has been reset successfully.',
      verificationRequired: false,
      destinationHint: null,
    });

    await request(app.getHttpServer())
      .post('/api/auth/password-reset/verify')
      .send({ identifier: '012345678', code: '012345' })
      .expect(HttpStatus.OK)
      .expect({
        data: { resetToken: 'a'.repeat(43), expiresInSeconds: 900 },
      });

    await request(app.getHttpServer())
      .post('/api/auth/password-reset/confirm')
      .send({ resetToken: 'a'.repeat(43), newPassword: 'new-password' })
      .expect(HttpStatus.OK);

    await request(app.getHttpServer())
      .post('/api/auth/password-reset/confirm')
      .send({
        identifier: '012345678',
        code: '012345',
        newPassword: 'new-password',
      })
      .expect(HttpStatus.BAD_REQUEST);

    expect(authService.verifyPasswordReset).toHaveBeenCalledWith({
      identifier: '+85512345678',
      code: '012345',
    });
    expect(authService.confirmPasswordReset).toHaveBeenCalledWith({
      resetToken: 'a'.repeat(43),
      newPassword: 'new-password',
    });
  });
});
