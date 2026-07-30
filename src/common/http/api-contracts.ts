import type { ApiErrorCode } from '../errors/api-error-code';

export interface ApiErrorDetail {
  field: string;
  message: string;
  rule?: string;
}

export interface ApiErrorResponse {
  statusCode: number;
  code: ApiErrorCode;
  message: string;
  details?: ApiErrorDetail[];
  timestamp: string;
  path: string;
}

export interface ApiDataResponse<T> {
  data: T;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiPaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}
