import { HttpException, type HttpStatus } from '@nestjs/common';
import type { ApiErrorDetail } from '../http/api-contracts';
import type { ApiErrorCode } from './api-error-code';

export class DomainException extends HttpException {
  constructor(
    readonly code: ApiErrorCode,
    status: HttpStatus,
    readonly safeMessage: string,
    readonly details?: ApiErrorDetail[],
  ) {
    super(safeMessage, status);
  }
}
