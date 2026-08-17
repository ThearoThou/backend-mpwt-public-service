import {
  IsUUID,
  IsString,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { isCalendarDateOnly } from '../../vehicles/vehicle-date';

@ValidatorConstraint({ name: 'isReplacementCalendarDate', async: false })
class ReplacementCalendarDate implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isCalendarDateOnly(value);
  }
}

export class BookReplacementInspectionDto {
  @IsUUID('4') stationId!: string;
  @IsString()
  @Validate(ReplacementCalendarDate)
  capacityDate!: string;
}
