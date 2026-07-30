import type { PaginationMeta } from '../http/api-contracts';

export function createPaginationMeta(
  page: number,
  limit: number,
  total: number,
): PaginationMeta {
  validatePaginationMetaInputs(page, limit, total);

  return {
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}

function validatePaginationMetaInputs(
  page: number,
  limit: number,
  total: number,
): void {
  if (!Number.isInteger(page) || page < 1) {
    throw new RangeError(
      'Pagination page must be an integer greater than zero.',
    );
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError('Pagination limit must be an integer from 1 to 100.');
  }

  if (!Number.isInteger(total) || total < 0) {
    throw new RangeError('Pagination total must be a non-negative integer.');
  }
}
