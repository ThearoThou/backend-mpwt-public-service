import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';

import { AccessTokenGuard } from '../common/auth/access-token.guard';
import type { AuthenticatedActor } from '../common/auth/authenticated-actor';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import {
  createDataResponse,
  createPaginatedResponse,
} from '../common/http/api-response';
import type {
  ApiDataResponse,
  ApiPaginatedResponse,
} from '../common/http/api-contracts';
import {
  ListUsersQueryDto,
  UpdateUserStatusRequestDto,
} from './dto/user-request.dtos';
import { UserRole } from './enums/user-role.enum';
import type { UserSummaryResponse } from './user-response.mapper';
import { UsersService } from './users.service';

@Controller('admin/users')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async listUsers(
    @Query() input: ListUsersQueryDto,
  ): Promise<ApiPaginatedResponse<UserSummaryResponse>> {
    const result = await this.usersService.listUsers(input);

    return createPaginatedResponse(result.data, result.meta);
  }

  @Get(':id')
  async getUser(
    @Param('id', new ParseUUIDPipe({ version: '4' })) userId: string,
  ): Promise<ApiDataResponse<UserSummaryResponse>> {
    return createDataResponse(
      await this.usersService.getAdminUserDetail(userId),
    );
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  async updateUserStatus(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) userId: string,
    @Body() input: UpdateUserStatusRequestDto,
  ): Promise<ApiDataResponse<UserSummaryResponse>> {
    return createDataResponse(
      await this.usersService.updateUserStatus(
        actor.userId,
        userId,
        input.status,
      ),
    );
  }
}
