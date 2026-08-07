import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Matches,
  Min,
} from 'class-validator';

import { BasePaginationQueryDto } from '../../common/pagination/base-pagination-query.dto';
import { VehicleClass } from '../../vehicles/enums/vehicle-class.enum';

const KHR_AMOUNT_PATTERN = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/;

function trimString(params: { value: unknown }): unknown {
  return typeof params.value === 'string' ? params.value.trim() : params.value;
}

export class CreateInspectionCategoryRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Transform(trimString)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Transform(trimString)
  nameKh!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(trimString)
  nameEn?: string | null;

  @IsEnum(VehicleClass)
  vehicleClass!: VehicleClass;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(32767)
  validityMonths!: number;

  @IsString()
  @Matches(KHR_AMOUNT_PATTERN, {
    message: 'must be a non-negative amount with at most two decimal places',
  })
  inspectionFeeKhr!: string;

  @IsString()
  @Matches(KHR_AMOUNT_PATTERN, {
    message: 'must be a non-negative amount with at most two decimal places',
  })
  serviceFeeKhr!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateInspectionCategoryRequestDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Transform(trimString)
  nameKh?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(trimString)
  nameEn?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(32767)
  validityMonths?: number;

  @IsOptional()
  @IsString()
  @Matches(KHR_AMOUNT_PATTERN, {
    message: 'must be a non-negative amount with at most two decimal places',
  })
  inspectionFeeKhr?: string;

  @IsOptional()
  @IsString()
  @Matches(KHR_AMOUNT_PATTERN, {
    message: 'must be a non-negative amount with at most two decimal places',
  })
  serviceFeeKhr?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class InspectionCategoryQueryDto extends BasePaginationQueryDto {}
