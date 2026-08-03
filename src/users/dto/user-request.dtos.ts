import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import {
  IsCambodianPhone,
  IsNormalizedEmail,
} from '../../auth/identifier-normalization.validators';
import {
  normalizeCambodianPhone,
  normalizeEmail,
} from '../../auth/identifier-normalization';
import {
  BasePaginationQueryDto,
  type SortOrder,
} from '../../common/pagination/base-pagination-query.dto';
import { UserRole } from '../enums/user-role.enum';
import { UserStatus } from '../enums/user-status.enum';

export const USER_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'role',
  'status',
] as const;

export type UserSortField = (typeof USER_SORT_FIELDS)[number];

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

function trimString(params: { value: unknown }): unknown {
  return typeof params.value === 'string' ? params.value.trim() : params.value;
}

export class UpdateCitizenProfileRequestDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  @Transform(trimString)
  nameKh?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  @Transform(trimString)
  nameEn?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Transform(trimString)
  nationalIdNumber?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(trimString)
  address?: string;
}

export class ListUsersQueryDto extends BasePaginationQueryDto {
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Transform(normalizeWhenValid(normalizeCambodianPhone))
  @IsCambodianPhone()
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(254)
  @Transform(normalizeWhenValid(normalizeEmail))
  @IsNormalizedEmail()
  email?: string;

  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @IsOptional()
  @IsIn(USER_SORT_FIELDS)
  sortBy: UserSortField = 'createdAt';

  declare sortOrder: SortOrder;
}

export class UpdateUserStatusRequestDto {
  @IsIn([UserStatus.ACTIVE, UserStatus.DISABLED])
  status!: UserStatus.ACTIVE | UserStatus.DISABLED;
}
