import { ConfigService } from '@nestjs/config';
import { join } from 'node:path';
import type { DataSourceOptions } from 'typeorm';

import type { EnvironmentVariables } from '../config/environment.validation';
import { databaseEntities } from './database.entities';

type DatabaseEnvironment = Pick<
  EnvironmentVariables,
  | 'DB_HOST'
  | 'DB_PORT'
  | 'DB_USERNAME'
  | 'DB_PASSWORD'
  | 'DB_NAME'
  | 'DB_LOGGING'
>;

export function getDatabaseEnvironment(
  configService: ConfigService,
): DatabaseEnvironment {
  return {
    DB_HOST: configService.getOrThrow<string>('DB_HOST'),
    DB_PORT: configService.getOrThrow<number>('DB_PORT'),
    DB_USERNAME: configService.getOrThrow<string>('DB_USERNAME'),
    DB_PASSWORD: configService.getOrThrow<string>('DB_PASSWORD'),
    DB_NAME: configService.getOrThrow<string>('DB_NAME'),
    DB_LOGGING: configService.getOrThrow<boolean>('DB_LOGGING'),
  };
}

export function createDatabaseOptions(
  environment: DatabaseEnvironment,
): DataSourceOptions {
  return {
    type: 'postgres',
    host: environment.DB_HOST,
    port: environment.DB_PORT,
    username: environment.DB_USERNAME,
    password: environment.DB_PASSWORD,
    database: environment.DB_NAME,
    entities: databaseEntities,
    migrations: [join(__dirname, 'migrations', '*{.ts,.js}')],
    synchronize: false,
    dropSchema: false,
    migrationsRun: false,
    logging: environment.DB_LOGGING,
    migrationsTableName: 'typeorm_migrations',
  };
}
