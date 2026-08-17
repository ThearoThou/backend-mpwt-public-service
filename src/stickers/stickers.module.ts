import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Sticker } from './entities/sticker.entity';
import { AdminStickersController } from './admin-stickers.controller';
import { CitizenStickersController } from './citizen-stickers.controller';
import { CommonAuthModule } from '../common/auth/common-auth.module';
import { User } from '../users/entities/user.entity';
import { StickerReadsService } from './sticker-reads.service';
import { StickerCommandsService } from './sticker-commands.service';

@Module({
  imports: [CommonAuthModule, TypeOrmModule.forFeature([Sticker, User])],
  controllers: [AdminStickersController, CitizenStickersController],
  providers: [StickerReadsService, StickerCommandsService],
})
export class StickersModule {}
