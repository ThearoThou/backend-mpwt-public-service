import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import type { AuthenticatedActor } from '../common/auth/authenticated-actor';
import { AccessTokenGuard } from '../common/auth/access-token.guard';
import { Roles } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import { createDataResponse } from '../common/http/api-response';
import { UserRole } from '../users/enums/user-role.enum';
import { StickerReadsService } from './sticker-reads.service';

@Controller('applications')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.CITIZEN)
export class CitizenStickersController {
  constructor(private readonly reads: StickerReadsService) {}
  @Get(':applicationId/sticker-status')
  async status(
    @Param('applicationId', new ParseUUIDPipe({ version: '4' }))
    applicationId: string,
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    return createDataResponse(
      await this.reads.getCitizenStatus(actor.userId, applicationId),
    );
  }
}
