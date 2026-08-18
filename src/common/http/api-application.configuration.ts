import {
  HttpStatus,
  type INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { ApiExceptionFilter } from '../errors/api-exception.filter';
import { ApiErrorCode } from '../errors/api-error-code';
import { DomainException } from '../errors/domain.exception';
import { formatValidationErrors } from '../errors/validation-error.formatter';
import { normalizeApiPrefix } from './api-prefix';

export function configureApiApplication(
  app: INestApplication,
  apiPrefix: string | undefined,
  frontendOrigin: string,
): void {
  app.enableCors({
    origin: frontendOrigin,
    credentials: true,
  });

  app.setGlobalPrefix(normalizeApiPrefix(apiPrefix));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      validationError: { target: false, value: false },
      exceptionFactory: (errors) =>
        new DomainException(
          ApiErrorCode.VALIDATION_ERROR,
          HttpStatus.BAD_REQUEST,
          'Request validation failed',
          formatValidationErrors(errors),
        ),
    }),
  );

  app.useGlobalFilters(new ApiExceptionFilter());
}