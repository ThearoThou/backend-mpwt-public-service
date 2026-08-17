import { IsEnum } from 'class-validator';

import { BasePaginationQueryDto } from '../../common/pagination/base-pagination-query.dto';

export const ADMIN_STICKER_VIEWS = ['AWAITING', 'ISSUED'] as const;
export type AdminStickerView = (typeof ADMIN_STICKER_VIEWS)[number];

export class AdminStickerQueryDto extends BasePaginationQueryDto {
  @IsEnum(ADMIN_STICKER_VIEWS)
  view: AdminStickerView = 'AWAITING';
}
