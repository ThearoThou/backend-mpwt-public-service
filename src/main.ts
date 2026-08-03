import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AdminBootstrapService } from './auth/admin-bootstrap.service';
import { AppModule } from './app.module';
import { configureApiApplication } from './common/http/api-application.configuration';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.use(cookieParser());
  configureApiApplication(app, configService.getOrThrow<string>('API_PREFIX'));
  await app.get(AdminBootstrapService).bootstrapInitialAdministrator();

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
