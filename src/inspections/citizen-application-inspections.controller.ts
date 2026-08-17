import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { AccessTokenGuard } from '../common/auth/access-token.guard';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import type { AuthenticatedActor } from '../common/auth/authenticated-actor';
import { Roles } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import { createDataResponse } from '../common/http/api-response';
import { UserRole } from '../users/enums/user-role.enum';
import { BookReplacementInspectionDto } from './dto/replacement-inspection.dto';
import { InspectionReadsService } from './inspection-reads.service';
import { InspectionReplacementSchedulingService } from './inspection-replacement-scheduling.service';

@Controller('applications')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.CITIZEN)
export class CitizenApplicationInspectionsController {
  constructor(
    private readonly reads: InspectionReadsService,
    private readonly replacements: InspectionReplacementSchedulingService,
  ) {}

  @Get(':applicationId/inspection-status')
  async status(
    @Param('applicationId', new ParseUUIDPipe({ version: '4' }))
    applicationId: string,
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    return createDataResponse(
      await this.reads.getCitizenApplicationStatus(actor.userId, applicationId),
    );
  }

  @Get(
    ':applicationId/replacement-inspection/stations/:stationId/available-dates',
  )
  async availableDates(
    @Param('applicationId', new ParseUUIDPipe({ version: '4' }))
    applicationId: string,
    @Param('stationId', new ParseUUIDPipe({ version: '4' })) stationId: string,
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    return createDataResponse(
      await this.replacements.availableDates(
        actor.userId,
        applicationId,
        stationId,
      ),
    );
  }

  @Post(':applicationId/replacement-inspection/appointment')
  async book(
    @Param('applicationId', new ParseUUIDPipe({ version: '4' }))
    applicationId: string,
    @CurrentActor() actor: AuthenticatedActor,
    @Body() input: BookReplacementInspectionDto,
  ) {
    return createDataResponse(
      await this.replacements.book(actor.userId, applicationId, input),
    );
  }
}
