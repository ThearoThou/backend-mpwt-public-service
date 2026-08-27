import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { AccessTokenGuard } from '../common/auth/access-token.guard';
import { Roles } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import { createDataResponse } from '../common/http/api-response';
import { UserRole } from '../users/enums/user-role.enum';
import { ListInspectionServiceClosuresQueryDto } from './dto/scheduling-request.dtos';
import { InspectionCalendarService } from './inspection-calendar.service';

@Controller('inspection-calendar')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.CITIZEN)
export class InspectionCalendarController {
  constructor(private readonly calendar: InspectionCalendarService) {}

  @Get('closures')
  async listClosures(@Query() input: ListInspectionServiceClosuresQueryDto) {
    const closures = await this.calendar.listActiveClosures(
      input.from,
      input.to,
    );
    return createDataResponse(
      closures.map(({ closureDate, reasonKh, reasonEn }) => ({
        closureDate,
        reasonKh,
        reasonEn,
      })),
    );
  }
}
