import { IsUUID } from 'class-validator';

import { BasePaginationQueryDto } from '../../common/pagination/base-pagination-query.dto';

export class CreateRenewalApplicationDraftRequestDto {
  @IsUUID('4')
  vehicleId!: string;
}

export class ListCitizenApplicationsQueryDto extends BasePaginationQueryDto {}

export class RenewalApplicationStatusHistoryQueryDto extends BasePaginationQueryDto {}
