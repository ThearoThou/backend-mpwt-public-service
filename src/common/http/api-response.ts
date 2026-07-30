import type {
  ApiDataResponse,
  ApiPaginatedResponse,
  PaginationMeta,
} from './api-contracts';

export function createDataResponse<T>(data: T): ApiDataResponse<T> {
  return { data };
}

export function createPaginatedResponse<T>(
  data: T[],
  meta: PaginationMeta,
): ApiPaginatedResponse<T> {
  return { data, meta };
}
