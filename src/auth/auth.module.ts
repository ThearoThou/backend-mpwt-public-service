import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { VerificationCode } from './entities/verification-code.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [TypeOrmModule.forFeature([VerificationCode])],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
