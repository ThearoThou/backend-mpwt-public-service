import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { AccessTokenGuard } from '../common/auth/access-token.guard';
import type { AuthenticatedActor } from '../common/auth/authenticated-actor';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import { createDataResponse } from '../common/http/api-response';
import { UserRole } from '../users/enums/user-role.enum';
import { AdminApplicationReviewService } from './admin-application-review.service';
import { RequestApplicationCorrectionDto } from './dto/request-application-correction.dto';

@Controller('admin/applications')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminApplicationReviewController {
  constructor(
    private readonly adminApplicationReviewService: AdminApplicationReviewService,
  ) {}

  @Post(':applicationId/start-review')
  async startReview(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('applicationId', new ParseUUIDPipe({ version: '4' }))
    applicationId: string,
  ) {
    return createDataResponse(
      await this.adminApplicationReviewService.startReview(
        actor.userId,
        applicationId,
      ),
    );
  }

  @Post(':applicationId/request-correction')
  async requestCorrection(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('applicationId', new ParseUUIDPipe({ version: '4' }))
    applicationId: string,
    @Body() input: RequestApplicationCorrectionDto,
  ) {
    return createDataResponse(
      await this.adminApplicationReviewService.requestCorrection(
        actor.userId,
        applicationId,
        input,
      ),
    );
  }
}
