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
import {
  createDataResponse,
  createPaginatedResponse,
} from '../common/http/api-response';
import { UserRole } from '../users/enums/user-role.enum';
import { IssueStickerDto } from './dto/issue-sticker.dto';
import { AdminStickerQueryDto } from './dto/sticker-query.dto';
import { StickerCommandsService } from './sticker-commands.service';
import { StickerReadsService } from './sticker-reads.service';

@Controller('admin/stickers')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminStickersController {
  constructor(
    private readonly reads: StickerReadsService,
    private readonly commands: StickerCommandsService,
  ) {}

  @Get()
  async list(@Query() input: AdminStickerQueryDto) {
    const result = await this.reads.listAdmin(input);
    return {
      ...createPaginatedResponse(result.data, result.meta),
      summary: result.summary,
    };
  }
  @Get('applications/:applicationId') async detail(
    @Param('applicationId', new ParseUUIDPipe({ version: '4' }))
    applicationId: string,
  ) {
    return createDataResponse(await this.reads.getAdminDetail(applicationId));
  }

  @Post('applications/:applicationId/issue')
  async issue(
    @Param('applicationId', new ParseUUIDPipe({ version: '4' }))
    applicationId: string,
    @CurrentActor() actor: AuthenticatedActor,
    @Body() input: IssueStickerDto,
  ) {
    return createDataResponse(
      await this.commands.issue(applicationId, actor.userId, input),
    );
  }
}
