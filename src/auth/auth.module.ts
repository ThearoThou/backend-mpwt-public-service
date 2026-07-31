import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { VerificationCode } from './entities/verification-code.entity';
import { AuthController } from './auth.controller';
import { AuthSecurityModule } from './auth-security.module';
import { AuthService } from './auth.service';

@Module({
  imports: [TypeOrmModule.forFeature([VerificationCode]), AuthSecurityModule],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthSecurityModule],
})
export class AuthModule {}
