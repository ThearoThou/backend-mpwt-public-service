import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Validate,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

import {
  BasePaginationQueryDto,
  type SortOrder,
} from '../../common/pagination/base-pagination-query.dto';
import { isCalendarDateOnly } from '../../vehicles/vehicle-date';
import { ApplicationStatus } from '../enums/application-status.enum';

export const ADMIN_APPLICATION_SORT_FIELDS = [
  'submittedAt',
  'createdAt',
] as const;
export type AdminApplicationSortField =
  (typeof ADMIN_APPLICATION_SORT_FIELDS)[number];

export const ADMIN_APPLICATION_STATUSES = [
  ApplicationStatus.SUBMITTED,
  ApplicationStatus.UNDER_REVIEW,
  ApplicationStatus.CORRECTION_REQUIRED,
  ApplicationStatus.APPOINTMENT_SELECTION_REQUIRED,
  ApplicationStatus.APPROVED,
  ApplicationStatus.REJECTED,
  ApplicationStatus.REINSPECTION_REQUIRED,
  ApplicationStatus.INSPECTION_FAILED,
  ApplicationStatus.CANCELLED,
  ApplicationStatus.COMPLETED,
] as const;

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

@ValidatorConstraint({ name: 'hasValidSubmittedDateRange', async: false })
class SubmittedDateRangeConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, arguments_: ValidationArguments): boolean {
    const { submittedFrom, submittedTo } = arguments_.object as {
      submittedFrom?: string;
      submittedTo?: string;
    };

    return (
      submittedFrom === undefined ||
      submittedTo === undefined ||
      submittedFrom <= submittedTo
    );
  }

  defaultMessage(): string {
    return 'submittedFrom must not be after submittedTo';
  }
}

@ValidatorConstraint({ name: 'isApplicationCalendarDateOnly', async: false })
class ApplicationCalendarDateOnlyConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isCalendarDateOnly(value);
  }

  defaultMessage(): string {
    return 'must be a real calendar date in YYYY-MM-DD format';
  }
}

export class ListAdminApplicationsQueryDto extends BasePaginationQueryDto {
  @IsOptional()
  @IsIn(ADMIN_APPLICATION_STATUSES)
  status?: (typeof ADMIN_APPLICATION_STATUSES)[number];

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Transform(trimString)
  referenceNumber?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  @Transform(trimString)
  plateNumber?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  @Transform(trimString)
  citizenSearch?: string;

  @IsOptional()
  @IsString()
  @Validate(ApplicationCalendarDateOnlyConstraint)
  submittedFrom?: string;

  @IsOptional()
  @IsString()
  @Validate(ApplicationCalendarDateOnlyConstraint)
  @Validate(SubmittedDateRangeConstraint)
  submittedTo?: string;

  @IsOptional()
  @IsIn(ADMIN_APPLICATION_SORT_FIELDS)
  sortBy: AdminApplicationSortField = 'submittedAt';

  declare sortOrder: SortOrder;
}

export class AdminApplicationStatusHistoryQueryDto extends BasePaginationQueryDto {}
