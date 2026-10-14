import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditLog } from '../activity/entities/audit-log.entity';
import { AuthSessionPersistenceModule } from '../auth/auth-session-persistence.module';
import { AuthSecurityModule } from '../auth/auth-security.module';
import { CommonAuthModule } from '../common/auth/common-auth.module';
import { AdminUsersController } from './admin-users.controller';
import { CitizenProfile } from './entities/citizen-profile.entity';
import { User } from './entities/user.entity';
import { VerificationCode } from '../auth/entities/verification-code.entity';
import { VerificationCodeService } from '../auth/verification-code.service';
import { ProfileController } from './profile.controller';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, CitizenProfile, AuditLog, VerificationCode]),
    AuthSessionPersistenceModule,
    AuthSecurityModule,
    CommonAuthModule,
  ],
  controllers: [UsersController, ProfileController, AdminUsersController],
  providers: [UsersService, VerificationCodeService],
  exports: [UsersService],
})
export class UsersModule {}
