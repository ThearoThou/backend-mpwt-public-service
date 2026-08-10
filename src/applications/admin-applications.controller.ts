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
import { UserRole } from '../users/enums/user-role.enum';
import { AdminApplicationsService } from './admin-applications.service';
import {
  AdminApplicationStatusHistoryQueryDto,
  ListAdminApplicationsQueryDto,
} from './dto/admin-application-request.dtos';

@Controller('admin/applications')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminApplicationsController {
  constructor(
    private readonly adminApplicationsService: AdminApplicationsService,
  ) {}

  @Get()
  async list(@Query() input: ListAdminApplicationsQueryDto) {
    const result = await this.adminApplicationsService.list(input);
    return createPaginatedResponse(result.data, result.meta);
  }

  @Get(':applicationId')
  async detail(
    @Param('applicationId', new ParseUUIDPipe({ version: '4' }))
    applicationId: string,
  ) {
    return createDataResponse(
      await this.adminApplicationsService.getDetail(applicationId),
    );
  }

  @Get(':applicationId/status-history')
  async statusHistory(
    @Param('applicationId', new ParseUUIDPipe({ version: '4' }))
    applicationId: string,
    @Query() input: AdminApplicationStatusHistoryQueryDto,
  ) {
    const result = await this.adminApplicationsService.listStatusHistory(
      applicationId,
      input,
    );
    return createPaginatedResponse(result.data, result.meta);
  }
}
