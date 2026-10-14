import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { AccessTokenGuard } from '../common/auth/access-token.guard';
import type { AuthenticatedActor } from '../common/auth/authenticated-actor';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import { createDataResponse } from '../common/http/api-response';
import type { ApiDataResponse } from '../common/http/api-contracts';
import { RequestEmailChangeDto, UpdateCitizenProfileRequestDto, VerifyEmailChangeDto } from './dto/user-request.dtos';
import { UserRole } from './enums/user-role.enum';
import type { CurrentUserResponse } from './user-response.mapper';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(AccessTokenGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @Roles(UserRole.CITIZEN, UserRole.ADMIN)
  async getCurrentUser(
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<ApiDataResponse<CurrentUserResponse>> {
    return createDataResponse(
      await this.usersService.getCurrentUser(actor.userId),
    );
  }

  @Patch('me/citizen-profile')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.CITIZEN)
  async updateCurrentCitizenProfile(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() input: UpdateCitizenProfileRequestDto,
  ): Promise<ApiDataResponse<CurrentUserResponse>> {
    return createDataResponse(
      await this.usersService.updateCurrentCitizenProfile(actor.userId, input),
    );
  }

  @Post('me/email-change/request')
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles(UserRole.CITIZEN)
  async requestEmailChange(@CurrentActor() actor: AuthenticatedActor, @Body() input: RequestEmailChangeDto): Promise<ApiDataResponse<{ expiresInSeconds: number }>> {
    return createDataResponse(await this.usersService.requestEmailChange(actor.userId, input.email));
  }

  @Post('me/email-change/verify')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.CITIZEN)
  async verifyEmailChange(@CurrentActor() actor: AuthenticatedActor, @Body() input: VerifyEmailChangeDto): Promise<ApiDataResponse<CurrentUserResponse>> {
    return createDataResponse(await this.usersService.verifyEmailChange(actor.userId, input.email, input.code));
  }
}
