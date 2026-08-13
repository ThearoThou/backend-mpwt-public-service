import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

function trimOptionalString({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function trimRequiredString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class ConfirmPaymentDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trimOptionalString)
  paymentReference?: string;
}

export class PaymentTransitionReasonDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  @Transform(trimRequiredString)
  reason!: string;
}
