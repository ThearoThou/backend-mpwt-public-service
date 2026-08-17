import { Transform } from 'class-transformer';
import {
  IsEnum,
  Validate,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';

import { InspectionResult } from '../enums/inspection-result.enum';

@ValidatorConstraint({ name: 'isValidInspectionFailureReason', async: false })
class InspectionFailureReasonConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, arguments_: ValidationArguments): boolean {
    const { result } = arguments_.object as Record<string, unknown>;
    if (result === InspectionResult.PASS) {
      return value === undefined || value === null;
    }
    return (
      result === InspectionResult.FAIL &&
      typeof value === 'string' &&
      value.length > 0 &&
      value.length <= 500
    );
  }
}

export class RecordInspectionResultDto {
  @IsEnum(InspectionResult)
  result!: InspectionResult;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Validate(InspectionFailureReasonConstraint)
  failureReason?: string | null;
}
