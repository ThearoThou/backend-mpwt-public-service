import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Sticker } from './entities/sticker.entity';
import { AdminStickersController } from './admin-stickers.controller';
import { CitizenCertificatesController } from './citizen-certificates.controller';
import { StickersService } from './stickers.service';

@Module({
  imports: [TypeOrmModule.forFeature([Sticker])],
  controllers: [AdminStickersController, CitizenCertificatesController],
  providers: [StickersService],
})
export class StickersModule {}
