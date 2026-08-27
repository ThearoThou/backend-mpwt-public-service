import { IsUUID } from 'class-validator';

import { RecordInspectionResultDto } from './record-inspection-result.dto';

/** Records the first physical inspection attempt for this renewal application. */
export class RecordApplicationInspectionResultDto extends RecordInspectionResultDto {
  @IsUUID('4')
  actualStationId!: string;
}
