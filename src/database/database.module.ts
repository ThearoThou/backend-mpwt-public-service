import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ConfigModule } from '../config/config.module';
import {
  createDatabaseOptions,
  getDatabaseEnvironment,
} from './database.options';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        createDatabaseOptions(getDatabaseEnvironment(configService)),
    }),
  ],
})
export class DatabaseModule {}
