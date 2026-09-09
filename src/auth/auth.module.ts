import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { VerificationCode } from './entities/verification-code.entity';
import { PasswordResetAuthorization } from './entities/password-reset-authorization.entity';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { AuthController } from './auth.controller';
import { AuthSecurityModule } from './auth-security.module';
import { AuthService } from './auth.service';
import { UsersModule } from '../users/users.module';
import { VerificationCodeService } from './verification-code.service';
import { PasswordResetAuthorizationService } from './password-reset-authorization.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([VerificationCode, PasswordResetAuthorization]),
    AuthSecurityModule,
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    VerificationCodeService,
    PasswordResetAuthorizationService,
    AdminBootstrapService,
  ],
  exports: [AuthSecurityModule],
})
export class AuthModule {}
