import { Module } from '@nestjs/common';

import { CommonAuthModule } from './auth/common-auth.module';

@Module({
  imports: [CommonAuthModule],
  exports: [CommonAuthModule],
})
export class CommonModule {}
