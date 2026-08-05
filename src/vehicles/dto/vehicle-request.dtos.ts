import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  Validate,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

import { normalizeCambodianPhone } from '../../auth/identifier-normalization';
import { IsCambodianPhone } from '../../auth/identifier-normalization.validators';
import {
  BasePaginationQueryDto,
  type SortOrder,
} from '../../common/pagination/base-pagination-query.dto';
import { canonicalizeVehicleIdentifier } from '../vehicle-normalization';
import { isCalendarDateOnly } from '../vehicle-date';
import { VehiclePlateCategory } from '../enums/vehicle-plate-category.enum';
import {
  isValidVehiclePlate,
  normalizePlateNumber,
  normalizePlateProvince,
} from '../vehicle-plate';

export const VEHICLE_SORT_FIELDS = [
  'createdAt',
  'registrationNumber',
  'plateNumber',
] as const;

export type VehicleSortField = (typeof VEHICLE_SORT_FIELDS)[number];

@ValidatorConstraint({ name: 'isVehicleCalendarDateOnly', async: false })
class VehicleCalendarDateOnlyConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isCalendarDateOnly(value);
  }

  defaultMessage(): string {
    return 'must be a real calendar date in YYYY-MM-DD format';
  }
}

@ValidatorConstraint({ name: 'hasValidVehicleCreatedRange', async: false })
class VehicleCreatedRangeConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, arguments_: ValidationArguments): boolean {
    const { createdFrom, createdTo } = arguments_.object as {
      createdFrom?: string;
      createdTo?: string;
    };

    return (
      createdFrom === undefined ||
      createdTo === undefined ||
      createdFrom <= createdTo
    );
  }

  defaultMessage(): string {
    return 'createdFrom must not be later than createdTo';
  }
}

@ValidatorConstraint({ name: 'hasValidVehiclePlate', async: false })
class VehiclePlateConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, arguments_: ValidationArguments): boolean {
    const { plateCategory, plateProvince, plateNumber } = arguments_.object as {
      plateCategory?: unknown;
      plateProvince?: unknown;
      plateNumber?: unknown;
    };

    return isValidVehiclePlate(plateCategory, plateProvince, plateNumber);
  }

  defaultMessage(): string {
    return 'plate category, province, and number are invalid';
  }
}

function normalizeWhenValid(
  normalizer: (value: string) => string,
): (params: { value: unknown }) => unknown {
  return ({ value }) => {
    if (typeof value !== 'string') {
      return value;
    }

    try {
      return normalizer(value);
    } catch {
      return value;
    }
  };
}

function canonicalizeVehicleIdentifierValue(params: {
  value: unknown;
}): unknown {
  return typeof params.value === 'string'
    ? canonicalizeVehicleIdentifier(params.value)
    : params.value;
}

function trimString(params: { value: unknown }): unknown {
  return typeof params.value === 'string' ? params.value.trim() : params.value;
}

function normalizePlateNumberValue(params: { value: unknown }): unknown {
  return typeof params.value === 'string'
    ? normalizePlateNumber(params.value)
    : params.value;
}

function normalizePlateProvinceValue(params: { value: unknown }): unknown {
  return typeof params.value === 'string'
    ? normalizePlateProvince(params.value)
    : params.value;
}

export class CreateVehicleRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Transform(canonicalizeVehicleIdentifierValue)
  registrationNumber!: string;

  @MaxLength(30)
  @IsString()
  @Transform(normalizePlateNumberValue)
  @Validate(VehiclePlateConstraint)
  plateNumber!: string;

  @IsEnum(VehiclePlateCategory)
  plateCategory!: VehiclePlateCategory;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(normalizePlateProvinceValue)
  plateProvince?: string | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Transform(trimString)
  plateType!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Transform(trimString)
  vehicleType!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(trimString)
  make!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(trimString)
  model!: string;

  @IsOptional()
  @IsInt()
  @Min(-32768)
  @Max(32767)
  manufactureYear?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(canonicalizeVehicleIdentifierValue)
  chassisNumber!: string;

  @Transform(trimString)
  @IsString()
  @Validate(VehicleCalendarDateOnlyConstraint)
  firstRegistrationDate!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Validate(VehicleCalendarDateOnlyConstraint)
  lastInspectionDate?: string;

  @Transform(trimString)
  @IsString()
  @Validate(VehicleCalendarDateOnlyConstraint)
  inspectionExpiryDate!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  @Transform(trimString)
  registeredOwnerNameKh!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  @Transform(trimString)
  registeredOwnerNameEn!: string;

  @IsString()
  @MaxLength(20)
  @Transform(normalizeWhenValid(normalizeCambodianPhone))
  @IsCambodianPhone()
  registeredOwnerPhone!: string;
}

class VehiclePaginationQueryDto extends BasePaginationQueryDto {
  @IsOptional()
  @IsIn(VEHICLE_SORT_FIELDS)
  sortBy: VehicleSortField = 'createdAt';

  declare sortOrder: SortOrder;
}

export class ListCitizenVehiclesQueryDto extends VehiclePaginationQueryDto {}

export class ListAdminVehiclesQueryDto extends VehiclePaginationQueryDto {
  @IsOptional()
  @IsUUID('4')
  linkedCitizenId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Transform(canonicalizeVehicleIdentifierValue)
  registrationNumber?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(canonicalizeVehicleIdentifierValue)
  chassisNumber?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  @Transform(canonicalizeVehicleIdentifierValue)
  plateNumber?: string;

  @IsOptional()
  @IsString()
  @Validate(VehicleCalendarDateOnlyConstraint)
  createdFrom?: string;

  @IsOptional()
  @IsString()
  @Validate(VehicleCalendarDateOnlyConstraint)
  @Validate(VehicleCreatedRangeConstraint)
  createdTo?: string;
}
