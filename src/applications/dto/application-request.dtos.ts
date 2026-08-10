import { IsUUID } from 'class-validator';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

import { BasePaginationQueryDto } from '../../common/pagination/base-pagination-query.dto';

export class CreateRenewalApplicationDraftRequestDto {
  @IsUUID('4')
  vehicleId!: string;
}

export class ListCitizenApplicationsQueryDto extends BasePaginationQueryDto {}

export class RenewalApplicationStatusHistoryQueryDto extends BasePaginationQueryDto {}

export class CancelRenewalApplicationRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;

    const normalized = value.trim();
    return normalized === '' ? null : normalized;
  })
  reason?: string | null;
}
