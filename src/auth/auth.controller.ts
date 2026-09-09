import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import {
  AuthTokenResponse,
  PasswordResetRequestResponse,
  PasswordResetVerifyResponse,
  RegistrationResponse,
  RegistrationVerificationResponse,
} from './auth-response.mapper';
import { RefreshCookieHelper } from './refresh-cookie.helper';
import { AuthService } from './auth.service';
import {
  LoginRequestDto,
  PasswordResetConfirmRequestDto,
  PasswordResetRequestDto,
  PasswordResetVerifyRequestDto,
  RegisterRequestDto,
  ResendVerificationRequestDto,
  VerifyAccountRequestDto,
} from './dto/auth-request.dtos';
import { createDataResponse } from '../common/http/api-response';
import type { ApiDataResponse } from '../common/http/api-contracts';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly refreshCookieHelper: RefreshCookieHelper,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() input: RegisterRequestDto,
  ): Promise<ApiDataResponse<RegistrationVerificationResponse>> {
    return createDataResponse(await this.authService.register(input));
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(
    @Body() input: VerifyAccountRequestDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiDataResponse<AuthTokenResponse>> {
    const result = await this.authService.verifyAccount(input);
    this.refreshCookieHelper.setRefreshToken(
      response,
      result.refreshToken,
      result.refreshExpiresAt,
    );

    return createDataResponse(result.response);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.ACCEPTED)
  async resendVerification(
    @Body() input: ResendVerificationRequestDto,
  ): Promise<ApiDataResponse<RegistrationVerificationResponse>> {
    return createDataResponse(await this.authService.resendVerification(input));
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() input: LoginRequestDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiDataResponse<AuthTokenResponse>> {
    const result = await this.authService.login(input);
    this.refreshCookieHelper.setRefreshToken(
      response,
      result.refreshToken,
      result.refreshExpiresAt,
    );

    return createDataResponse(result.response);
  }

  @Post('password-reset/request')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestPasswordReset(
    @Body() input: PasswordResetRequestDto,
  ): Promise<ApiDataResponse<PasswordResetRequestResponse>> {
    return createDataResponse(
      await this.authService.requestPasswordReset(input),
    );
  }

  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmPasswordReset(
    @Body() input: PasswordResetConfirmRequestDto,
  ): Promise<ApiDataResponse<RegistrationResponse>> {
    return createDataResponse(
      await this.authService.confirmPasswordReset(input),
    );
  }

  @Post('password-reset/verify')
  @HttpCode(HttpStatus.OK)
  async verifyPasswordReset(
    @Body() input: PasswordResetVerifyRequestDto,
  ): Promise<ApiDataResponse<PasswordResetVerifyResponse>> {
    return createDataResponse(
      await this.authService.verifyPasswordReset(input),
    );
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiDataResponse<AuthTokenResponse>> {
    try {
      this.authService.assertNoJsonBody(body, request);
      const result = await this.authService.refresh(
        this.refreshCookieHelper.readRefreshToken(request),
      );
      this.refreshCookieHelper.setRefreshToken(
        response,
        result.refreshToken,
        result.refreshExpiresAt,
      );

      return createDataResponse(result.response);
    } catch (error) {
      this.refreshCookieHelper.clearRefreshToken(response);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiDataResponse<{ message: string }>> {
    try {
      this.authService.assertNoJsonBody(body, request);
      await this.authService.logout(
        this.refreshCookieHelper.readRefreshToken(request),
      );

      return createDataResponse({ message: 'Logged out successfully.' });
    } finally {
      this.refreshCookieHelper.clearRefreshToken(response);
    }
  }
}
