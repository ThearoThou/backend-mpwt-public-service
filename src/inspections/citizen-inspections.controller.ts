import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { AccessTokenGuard } from '../common/auth/access-token.guard';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import type { AuthenticatedActor } from '../common/auth/authenticated-actor';
import { Roles } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import { createPaginatedResponse } from '../common/http/api-response';
import { UserRole } from '../users/enums/user-role.enum';
import { CitizenInspectionHistoryQueryDto } from './dto/inspection-query.dtos';
import { InspectionReadsService } from './inspection-reads.service';

@Controller('inspections')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.CITIZEN)
export class CitizenInspectionsController {
  constructor(private readonly reads: InspectionReadsService) {}

  @Get()
  async history(
    @CurrentActor() actor: AuthenticatedActor,
    @Query() input: CitizenInspectionHistoryQueryDto,
  ) {
    const result = await this.reads.listCitizenInspectionHistory(
      actor.userId,
      input,
    );
    return createPaginatedResponse(result.data, result.meta);
  }
}
