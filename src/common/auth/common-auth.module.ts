import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthSecurityModule } from '../../auth/auth-security.module';
import { User } from '../../users/entities/user.entity';
import { AccessTokenGuard } from './access-token.guard';
import { RolesGuard } from './roles.guard';

@Module({
  imports: [TypeOrmModule.forFeature([User]), AuthSecurityModule],
  providers: [AccessTokenGuard, RolesGuard],
  exports: [AccessTokenGuard, RolesGuard],
})
export class CommonAuthModule {}
