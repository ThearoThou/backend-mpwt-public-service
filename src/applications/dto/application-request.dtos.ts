import { IsArray, IsEnum, IsUUID } from 'class-validator';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

import { BasePaginationQueryDto } from '../../common/pagination/base-pagination-query.dto';
import { ApplicationStatus } from '../enums/application-status.enum';

export class CreateRenewalApplicationDraftRequestDto {
  @IsUUID('4')
  vehicleId!: string;
}

export class ListCitizenApplicationsQueryDto extends BasePaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;

    const normalized = value.trim();
    return normalized === '' ? undefined : normalized;
  })
  search?: string;

  @IsOptional()
  @IsEnum(ApplicationStatus)
  status?: ApplicationStatus;

  @IsOptional()
  @IsArray()
  @IsEnum(ApplicationStatus, { each: true })
  @Transform(({ value }: { value: unknown }) => normalizeStatuses(value))
  statuses?: ApplicationStatus[];
}

function normalizeStatuses(value: unknown): unknown {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : value;
  if (!Array.isArray(values)) return value;

  const normalized = (values as unknown[]).flatMap((item) => {
    if (typeof item !== 'string') return [item];
    return item
      .split(',')
      .map((status) => status.trim())
      .filter(Boolean);
  });
  return normalized.length === 0 ? undefined : [...new Set(normalized)];
}

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
