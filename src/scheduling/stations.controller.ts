import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../common/auth/access-token.guard';
import { Roles } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import { createDataResponse } from '../common/http/api-response';
import { UserRole } from '../users/enums/user-role.enum';
import { CitizenSchedulingAvailabilityService } from './citizen-scheduling-availability.service';
import { CitizenPreferredSchedulingService } from './citizen-preferred-scheduling.service';

@Controller('stations')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.CITIZEN)
export class StationsController {
  constructor(
    private readonly availability: CitizenSchedulingAvailabilityService,
    private readonly preferredScheduling: CitizenPreferredSchedulingService,
  ) {}
  @Get()
  async listActiveStations() {
    const stations = await this.availability.listActiveStations();
    return createDataResponse(
      stations.map(
        ({ id, code, nameKh, nameEn, province, address, phone }) => ({
          id,
          code,
          nameKh,
          nameEn,
          province,
          address,
          phone,
        }),
      ),
    );
  }
  @Get(':stationId/available-dates')
  async listAvailableDates(
    @Param('stationId', new ParseUUIDPipe({ version: '4' })) stationId: string,
  ) {
    return createDataResponse(
      await this.availability.listSelectableDates(stationId),
    );
  }
  @Get(':stationId/preferred-dates')
  /**
   * @deprecated New preference creation is date-first and does not call this
   * station-specific legacy availability endpoint.
   */
  async listPreferredDates(
    @Param('stationId', new ParseUUIDPipe({ version: '4' })) stationId: string,
  ) {
    return createDataResponse(
      await this.preferredScheduling.listPreferredDates(stationId),
    );
  }
}
