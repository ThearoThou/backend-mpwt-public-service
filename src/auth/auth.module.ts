import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RefreshSession } from './entities/refresh-session.entity';
import { VerificationCode } from './entities/verification-code.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [TypeOrmModule.forFeature([VerificationCode, RefreshSession])],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
