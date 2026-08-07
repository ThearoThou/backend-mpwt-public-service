import {
  Body,
  Controller,
  Get,
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
import { UserRole } from '../users/enums/user-role.enum';
import {
  ClassifyVehicleRequestDto,
  ListAdminVehiclesQueryDto,
  VehicleClassificationHistoryQueryDto,
} from './dto/vehicle-request.dtos';
import type { VehicleClassificationHistoryResponse } from './vehicle-classification-history-response.mapper';
import { VehicleClassificationService } from './vehicle-classification.service';
import type { VehicleResponse } from './vehicle-response.mapper';
import { VehiclesService } from './vehicles.service';

@Controller('admin/vehicles')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminVehiclesController {
  constructor(
    private readonly vehiclesService: VehiclesService,
    private readonly vehicleClassificationService: VehicleClassificationService,
  ) {}

  @Get()
  async listVehicles(
    @Query() input: ListAdminVehiclesQueryDto,
  ): Promise<ApiPaginatedResponse<VehicleResponse>> {
    const result = await this.vehiclesService.listAdminVehicles(input);

    return createPaginatedResponse(result.data, result.meta);
  }

  @Get(':vehicleId')
  async getVehicle(
    @Param('vehicleId', new ParseUUIDPipe({ version: '4' })) vehicleId: string,
  ): Promise<ApiDataResponse<VehicleResponse>> {
    return createDataResponse(
      await this.vehiclesService.getAdminVehicle(vehicleId),
    );
  }

  @Patch(':vehicleId/classification')
  async classifyVehicle(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('vehicleId', new ParseUUIDPipe({ version: '4' })) vehicleId: string,
    @Body() input: ClassifyVehicleRequestDto,
  ): Promise<ApiDataResponse<VehicleResponse>> {
    return createDataResponse(
      await this.vehicleClassificationService.classify(
        actor.userId,
        vehicleId,
        input,
      ),
    );
  }

  @Get(':vehicleId/classification-history')
  async listClassificationHistory(
    @Param('vehicleId', new ParseUUIDPipe({ version: '4' })) vehicleId: string,
    @Query() input: VehicleClassificationHistoryQueryDto,
  ): Promise<ApiPaginatedResponse<VehicleClassificationHistoryResponse>> {
    const result = await this.vehicleClassificationService.listHistory(
      vehicleId,
      input,
    );

    return createPaginatedResponse(result.data, result.meta);
  }
}
