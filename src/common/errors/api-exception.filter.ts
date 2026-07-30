import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ApiErrorCode,
  type ApiErrorCode as ApiErrorCodeValue,
} from './api-error-code';
import { DomainException } from './domain.exception';
import type { ApiErrorResponse } from '../http/api-contracts';

interface SafeHttpExceptionMapping {
  statusCode: HttpStatus;
  code: ApiErrorCodeValue;
  message: string;
}

const SAFE_HTTP_EXCEPTION_MAPPINGS: Partial<
  Record<number, SafeHttpExceptionMapping>
> = {
  [HttpStatus.BAD_REQUEST]: {
    statusCode: HttpStatus.BAD_REQUEST,
    code: ApiErrorCode.VALIDATION_ERROR,
    message: 'Request validation failed',
  },
  [HttpStatus.UNAUTHORIZED]: {
    statusCode: HttpStatus.UNAUTHORIZED,
    code: ApiErrorCode.AUTH_TOKEN_INVALID,
    message: 'Authentication is required',
  },
  [HttpStatus.FORBIDDEN]: {
    statusCode: HttpStatus.FORBIDDEN,
    code: ApiErrorCode.FORBIDDEN,
    message: 'Access is forbidden',
  },
  [HttpStatus.NOT_FOUND]: {
    statusCode: HttpStatus.NOT_FOUND,
    code: ApiErrorCode.RESOURCE_NOT_FOUND,
    message: 'Resource not found',
  },
  [HttpStatus.CONFLICT]: {
    statusCode: HttpStatus.CONFLICT,
    code: ApiErrorCode.CONFLICT,
    message: 'Request conflicts with the current state',
  },
  [HttpStatus.TOO_MANY_REQUESTS]: {
    statusCode: HttpStatus.TOO_MANY_REQUESTS,
    code: ApiErrorCode.RATE_LIMIT_EXCEEDED,
    message: 'Too many requests',
  },
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const errorResponse = this.createErrorResponse(exception, request);

    response.status(errorResponse.statusCode).json(errorResponse);
  }

  private createErrorResponse(
    exception: unknown,
    request: Request,
  ): ApiErrorResponse {
    const baseResponse = {
      timestamp: new Date().toISOString(),
      path: request.originalUrl || request.url || '/',
    };

    if (exception instanceof DomainException) {
      return {
        statusCode: exception.getStatus(),
        code: exception.code,
        message: exception.safeMessage,
        ...(exception.details === undefined
          ? {}
          : { details: exception.details }),
        ...baseResponse,
      };
    }

    if (exception instanceof HttpException) {
      const mapping = SAFE_HTTP_EXCEPTION_MAPPINGS[exception.getStatus()];

      if (mapping !== undefined) {
        return { ...mapping, ...baseResponse };
      }
    }

    this.logger.error('Unhandled API exception');

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ApiErrorCode.INTERNAL_SERVER_ERROR,
      message: 'An unexpected error occurred',
      ...baseResponse,
    };
  }
}
