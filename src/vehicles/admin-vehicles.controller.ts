import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';

import { AccessTokenGuard } from '../common/auth/access-token.guard';
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
import { ListAdminVehiclesQueryDto } from './dto/vehicle-request.dtos';
import type { VehicleResponse } from './vehicle-response.mapper';
import { VehiclesService } from './vehicles.service';

@Controller('admin/vehicles')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminVehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

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
}
