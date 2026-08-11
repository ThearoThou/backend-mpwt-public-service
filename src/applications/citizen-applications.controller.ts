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
import type {
  ApiDataResponse,
  ApiPaginatedResponse,
} from '../common/http/api-contracts';
import {
  createDataResponse,
  createPaginatedResponse,
} from '../common/http/api-response';
import { UserRole } from '../users/enums/user-role.enum';
import { type RenewalApplicationResponse } from './application-response.mapper';
import type { RenewalApplicationStatusHistoryResponse } from './application-status-history-response.mapper';
import { ApplicationWorkflowService } from './application-workflow.service';
import { CitizenSchedulingPreferenceService } from './citizen-scheduling-preference.service';
import { CitizenSchedulingPreferenceRequestDto } from '../scheduling/dto/scheduling-request.dtos';
import {
  CancelRenewalApplicationRequestDto,
  CreateRenewalApplicationDraftRequestDto,
  ListCitizenApplicationsQueryDto,
  RenewalApplicationStatusHistoryQueryDto,
} from './dto/application-request.dtos';
import { ApplicationsService } from './applications.service';

@Controller('applications')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.CITIZEN)
export class CitizenApplicationsController {
  constructor(
    private readonly applicationsService: ApplicationsService,
    private readonly applicationWorkflowService: ApplicationWorkflowService,
    private readonly schedulingPreferences: CitizenSchedulingPreferenceService,
  ) {}

  @Post()
  async createDraft(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() input: CreateRenewalApplicationDraftRequestDto,
  ): Promise<ApiDataResponse<RenewalApplicationResponse>> {
    return createDataResponse(
      await this.applicationWorkflowService.createDraft(
        actor.userId,
        input.vehicleId,
      ),
    );
  }

  @Post(':applicationId/submit') async submit(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('applicationId', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return createDataResponse(
      await this.applicationWorkflowService.submit(actor.userId, id),
    );
  }
  @Post(':applicationId/resubmit') async resubmit(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('applicationId', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return createDataResponse(
      await this.applicationWorkflowService.resubmit(actor.userId, id),
    );
  }
  @Post(':applicationId/scheduling-preference')
  async updateSchedulingPreference(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('applicationId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: CitizenSchedulingPreferenceRequestDto,
  ) {
    return createDataResponse(
      await this.schedulingPreferences.updateDraftPreference(
        actor.userId,
        id,
        input,
      ),
    );
  }
  @Post(':applicationId/appointment-selection')
  async reserveAppointmentSelection(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('applicationId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: CitizenSchedulingPreferenceRequestDto,
  ) {
    return createDataResponse(
      await this.schedulingPreferences.reserveAppointmentSelection(
        actor.userId,
        id,
        input,
      ),
    );
  }
  @Post(':applicationId/cancel') async cancel(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('applicationId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: CancelRenewalApplicationRequestDto,
  ) {
    return createDataResponse(
      await this.applicationWorkflowService.cancel(
        actor.userId,
        id,
        input.reason,
      ),
    );
  }

  @Get()
  async listApplications(
    @CurrentActor() actor: AuthenticatedActor,
    @Query() input: ListCitizenApplicationsQueryDto,
  ): Promise<ApiPaginatedResponse<RenewalApplicationResponse>> {
    const result = await this.applicationsService.listCitizenApplications(
      actor.userId,
      input,
    );

    return createPaginatedResponse(result.data, result.meta);
  }

  @Get(':applicationId/status-history')
  async listStatusHistory(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('applicationId', new ParseUUIDPipe({ version: '4' }))
    applicationId: string,
    @Query() input: RenewalApplicationStatusHistoryQueryDto,
  ): Promise<ApiPaginatedResponse<RenewalApplicationStatusHistoryResponse>> {
    const result = await this.applicationsService.listCitizenStatusHistory(
      actor.userId,
      applicationId,
      input,
    );

    return createPaginatedResponse(result.data, result.meta);
  }

  @Get(':applicationId')
  async getApplication(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('applicationId', new ParseUUIDPipe({ version: '4' }))
    applicationId: string,
  ): Promise<ApiDataResponse<RenewalApplicationResponse>> {
    return createDataResponse(
      await this.applicationsService.getCitizenApplication(
        actor.userId,
        applicationId,
      ),
    );
  }
}
