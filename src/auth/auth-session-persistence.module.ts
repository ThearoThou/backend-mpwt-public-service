import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RefreshSession } from './entities/refresh-session.entity';
import { RefreshSessionService } from './refresh-session.service';

@Module({
  imports: [TypeOrmModule.forFeature([RefreshSession])],
  providers: [RefreshSessionService],
  exports: [RefreshSessionService],
})
export class AuthSessionPersistenceModule {}
