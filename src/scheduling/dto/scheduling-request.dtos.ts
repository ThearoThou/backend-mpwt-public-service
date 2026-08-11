import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Min,
} from 'class-validator';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CitizenSchedulingPreferenceRequestDto {
  @IsUUID('4') stationId!: string;
  @Matches(DATE_ONLY_PATTERN) @IsDateString() capacityDate!: string;
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
