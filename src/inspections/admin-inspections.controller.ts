import {
  Controller,
  Body,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { AccessTokenGuard } from '../common/auth/access-token.guard';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import type { AuthenticatedActor } from '../common/auth/authenticated-actor';
import { Roles } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import {
  createDataResponse,
  createPaginatedResponse,
} from '../common/http/api-response';
import { UserRole } from '../users/enums/user-role.enum';
import { AdminInspectionQueueQueryDto } from './dto/inspection-query.dtos';
import { RecordInspectionResultDto } from './dto/record-inspection-result.dto';
import { RecordApplicationInspectionResultDto } from './dto/record-application-inspection-result.dto';
import { InspectionCommandsService } from './inspection-commands.service';
import { InspectionReadsService } from './inspection-reads.service';

@Controller('admin/inspections')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminInspectionsController {
  constructor(
    private readonly reads: InspectionReadsService,
    private readonly commands: InspectionCommandsService,
  ) {}

  @Get()
  async list(@Query() input: AdminInspectionQueueQueryDto) {
    const result = await this.reads.listAdminQueue(input);
    return createPaginatedResponse(result.data, result.meta);
  }

  @Get('appointments/:appointmentId')
  async detail(
    @Param('appointmentId', new ParseUUIDPipe({ version: '4' }))
    appointmentId: string,
  ) {
    return createDataResponse(
      await this.reads.getAdminAppointmentDetail(appointmentId),
    );
  }

  @Post('appointments/:appointmentId/result')
  async recordResult(
    @Param('appointmentId', new ParseUUIDPipe({ version: '4' }))
    appointmentId: string,
    @CurrentActor() actor: AuthenticatedActor,
    @Body() input: RecordInspectionResultDto,
  ) {
    await this.commands.recordResult(appointmentId, actor.userId, input);
    return createDataResponse(
      await this.reads.getAdminAppointmentDetail(appointmentId),
    );
  }

  @Post('applications/:applicationId/result')
  async recordApplicationFirstResult(
    @Param('applicationId', new ParseUUIDPipe({ version: '4' }))
    applicationId: string,
    @CurrentActor() actor: AuthenticatedActor,
    @Body() input: RecordApplicationInspectionResultDto,
  ) {
    await this.commands.recordApplicationFirstResult(
      applicationId,
      actor.userId,
      input,
    );
    return createDataResponse(
      await this.reads.getAdminApplicationInspectionDetail(applicationId),
    );
  }

  @Post('appointments/:appointmentId/no-show')
  async markNoShow(
    @Param('appointmentId', new ParseUUIDPipe({ version: '4' }))
    appointmentId: string,
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    await this.commands.markNoShowByAdmin(appointmentId, actor.userId);
    return createDataResponse(
      await this.reads.getAdminAppointmentDetail(appointmentId),
    );
  }
}
