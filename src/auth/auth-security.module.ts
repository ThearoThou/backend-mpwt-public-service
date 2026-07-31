import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { ConfigModule } from '../config/config.module';
import { AuthHashingService } from './auth-hashing.service';
import { AuthSessionPersistenceModule } from './auth-session-persistence.module';
import { AuthTokenService } from './auth-token.service';
import { RefreshCookieHelper } from './refresh-cookie.helper';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      }),
    }),
    AuthSessionPersistenceModule,
  ],
  providers: [AuthHashingService, AuthTokenService, RefreshCookieHelper],
  exports: [
    AuthHashingService,
    AuthTokenService,
    RefreshCookieHelper,
    AuthSessionPersistenceModule,
  ],
})
export class AuthSecurityModule {}
