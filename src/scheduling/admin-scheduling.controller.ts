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
import { Roles } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import { createDataResponse } from '../common/http/api-response';
import { UserRole } from '../users/enums/user-role.enum';
import { InspectionStationDailyCapacityService } from './inspection-station-daily-capacity.service';
import {
  CreateInspectionStationDailyCapacityRequestDto,
  ListInspectionStationDailyCapacitiesQueryDto,
  UpdateInspectionStationDailyCapacityRequestDto,
} from './dto/scheduling-request.dtos';

@Controller('admin/scheduling')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminSchedulingController {
  constructor(
    private readonly dailyCapacities: InspectionStationDailyCapacityService,
  ) {}
  @Get('daily-capacities') async list(
    @Query() input: ListInspectionStationDailyCapacitiesQueryDto,
  ) {
    return createDataResponse(await this.dailyCapacities.list(input.stationId));
  }
  @Get('daily-capacities/:dailyCapacityId') async get(
    @Param('dailyCapacityId', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return createDataResponse(await this.dailyCapacities.getById(id));
  }
  @Post('daily-capacities') async create(
    @Body() input: CreateInspectionStationDailyCapacityRequestDto,
  ) {
    return createDataResponse(await this.dailyCapacities.create(input));
  }
  @Post('daily-capacities/:dailyCapacityId/capacity') async updateCapacity(
    @Param('dailyCapacityId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: UpdateInspectionStationDailyCapacityRequestDto,
  ) {
    return createDataResponse(
      await this.dailyCapacities.updateDailyCapacity(id, input.dailyCapacity),
    );
  }
  @Post('daily-capacities/:dailyCapacityId/close') async close(
    @Param('dailyCapacityId', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return createDataResponse(
      await this.dailyCapacities.closeDailyCapacity(id),
    );
  }
  @Post('daily-capacities/:dailyCapacityId/reopen') async reopen(
    @Param('dailyCapacityId', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return createDataResponse(
      await this.dailyCapacities.reopenDailyCapacity(id),
    );
  }
}
