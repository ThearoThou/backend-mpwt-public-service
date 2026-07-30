import { Type } from 'class-transformer';
import { IsIn, IsInt, Max, Min } from 'class-validator';

export const SORT_ORDERS = ['asc', 'desc'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

// List routes default to descending order unless their own allowlist specifies otherwise.
export const DEFAULT_SORT_ORDER: SortOrder = 'desc';

export class BasePaginationQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsIn(SORT_ORDERS)
  sortOrder: SortOrder = DEFAULT_SORT_ORDER;
}
