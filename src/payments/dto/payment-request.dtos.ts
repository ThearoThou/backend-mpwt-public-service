import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import {
  BasePaginationQueryDto,
  type SortOrder,
} from '../../common/pagination/base-pagination-query.dto';
import { PaymentMethod } from '../enums/payment-method.enum';
import { PaymentStatus } from '../enums/payment-status.enum';

export const ADMIN_PAYMENT_SORT_FIELDS = [
  'createdAt',
  'invoiceIssuedAt',
  'totalAmount',
  'status',
] as const;
export type AdminPaymentSortField = (typeof ADMIN_PAYMENT_SORT_FIELDS)[number];

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class ListAdminPaymentsQueryDto extends BasePaginationQueryDto {
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  @Transform(trimString)
  search?: string;

  @IsOptional()
  @IsIn(ADMIN_PAYMENT_SORT_FIELDS)
  sortBy: AdminPaymentSortField = 'createdAt';

  declare sortOrder: SortOrder;
}
