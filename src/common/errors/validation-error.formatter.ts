import type { ValidationError } from 'class-validator';
import type { ApiErrorDetail } from '../http/api-contracts';

export function formatValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): ApiErrorDetail[] {
  return errors.flatMap((error) => {
    const field = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    const details = Object.entries(error.constraints ?? {}).map(
      ([rule, message]) => ({ field, message, rule }),
    );

    return [...details, ...formatValidationErrors(error.children ?? [], field)];
  });
}
