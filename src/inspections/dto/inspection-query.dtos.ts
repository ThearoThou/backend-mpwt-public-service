import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

import { BasePaginationQueryDto } from '../../common/pagination/base-pagination-query.dto';
import type { SortOrder } from '../../common/pagination/base-pagination-query.dto';
import { isCalendarDateOnly } from '../../vehicles/vehicle-date';

export const ADMIN_INSPECTION_QUEUE_VIEWS = [
  'PENDING',
  'PASSED',
  'FAILED',
] as const;
export type AdminInspectionQueueView =
  (typeof ADMIN_INSPECTION_QUEUE_VIEWS)[number];

@ValidatorConstraint({ name: 'isInspectionCalendarDateOnly', async: false })
class CalendarDateOnlyConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isCalendarDateOnly(value);
  }
}

export class AdminInspectionQueueQueryDto extends BasePaginationQueryDto {
  @IsIn(ADMIN_INSPECTION_QUEUE_VIEWS)
  view: AdminInspectionQueueView = 'PENDING';

  sortOrder: SortOrder = 'asc';

  @IsOptional()
  @IsUUID('4')
  stationId?: string;

  @IsOptional()
  @IsString()
  @Validate(CalendarDateOnlyConstraint)
  capacityDate?: string;
}

export class CitizenInspectionHistoryQueryDto extends BasePaginationQueryDto {
  @IsOptional()
  @IsUUID('4')
  vehicleId?: string;
}
