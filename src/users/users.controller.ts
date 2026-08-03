import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  UseGuards,
} from '@nestjs/common';

import { AccessTokenGuard } from '../common/auth/access-token.guard';
import type { AuthenticatedActor } from '../common/auth/authenticated-actor';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import { createDataResponse } from '../common/http/api-response';
import type { ApiDataResponse } from '../common/http/api-contracts';
import { UpdateCitizenProfileRequestDto } from './dto/user-request.dtos';
import { UserRole } from './enums/user-role.enum';
import type {
  CitizenProfileResponse,
  CurrentUserResponse,
} from './user-response.mapper';
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
  ): Promise<ApiDataResponse<CitizenProfileResponse>> {
    return createDataResponse(
      await this.usersService.updateCurrentCitizenProfile(actor.userId, input),
    );
  }
}
