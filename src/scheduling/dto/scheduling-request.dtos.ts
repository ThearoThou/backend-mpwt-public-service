import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNotEmpty,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Min,
} from 'class-validator';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CitizenSchedulingPreferenceRequestDto {
  @IsOptional()
  @IsUUID('4')
  preferredInspectionStationId?: string | null;

  @Matches(DATE_ONLY_PATTERN)
  @IsDateString()
  @IsNotEmpty()
  preferredInspectionDate!: string;
}
export class CreateInspectionStationDailyCapacityRequestDto {
  @IsUUID('4') stationId!: string;
  @Matches(DATE_ONLY_PATTERN) @IsDateString() capacityDate!: string;
  @Type(() => Number) @IsInt() @Min(1) dailyCapacity!: number;
}
export class UpdateInspectionStationDailyCapacityRequestDto {
  @Type(() => Number) @IsInt() @Min(1) dailyCapacity!: number;
}
export class ListInspectionStationDailyCapacitiesQueryDto {
  @IsOptional() @IsUUID('4') stationId?: string;
}

export class ListInspectionServiceClosuresQueryDto {
  @Matches(DATE_ONLY_PATTERN) @IsDateString() @IsNotEmpty() from!: string;
  @Matches(DATE_ONLY_PATTERN) @IsDateString() @IsNotEmpty() to!: string;
}
