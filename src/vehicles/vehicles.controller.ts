import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
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
import { UserRole } from '../users/enums/user-role.enum';
import {
  CreateVehicleRequestDto,
  ListCitizenVehiclesQueryDto,
} from './dto/vehicle-request.dtos';
import type {
  VehicleDetailResponse,
  VehicleResponse,
} from './vehicle-response.mapper';
import { VehiclesService } from './vehicles.service';

@Controller('vehicles')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.CITIZEN)
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get()
  async listVehicles(
    @CurrentActor() actor: AuthenticatedActor,
    @Query() input: ListCitizenVehiclesQueryDto,
  ): Promise<ApiPaginatedResponse<VehicleResponse>> {
    const result = await this.vehiclesService.listCitizenVehicles(
      actor.userId,
      input,
    );

    return createPaginatedResponse(result.data, result.meta);
  }

  @Post()
  async createVehicle(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() input: CreateVehicleRequestDto,
  ): Promise<ApiDataResponse<VehicleResponse>> {
    return createDataResponse(
      await this.vehiclesService.createCitizenVehicle(actor.userId, input),
    );
  }

  @Get(':vehicleId')
  async getVehicle(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('vehicleId', new ParseUUIDPipe({ version: '4' })) vehicleId: string,
  ): Promise<ApiDataResponse<VehicleDetailResponse>> {
    return createDataResponse(
      await this.vehiclesService.getCitizenVehicle(actor.userId, vehicleId),
    );
  }
}
