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
import { CommonAuthModule } from '../common/auth/common-auth.module';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      VerificationCode,
      PasswordResetAuthorization,
      User,
    ]),
    AuthSecurityModule,
    CommonAuthModule,
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
