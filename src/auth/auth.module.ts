import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { VerificationCode } from './entities/verification-code.entity';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { AuthController } from './auth.controller';
import { AuthSecurityModule } from './auth-security.module';
import { AuthService } from './auth.service';
import { UsersModule } from '../users/users.module';
import { VerificationCodeService } from './verification-code.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([VerificationCode]),
    AuthSecurityModule,
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, VerificationCodeService, AdminBootstrapService],
  exports: [AuthSecurityModule],
})
export class AuthModule {}
