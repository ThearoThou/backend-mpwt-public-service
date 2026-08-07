import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { AccessTokenGuard } from '../common/auth/access-token.guard';
import { Roles } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import {
  createDataResponse,
  createPaginatedResponse,
} from '../common/http/api-response';
import type {
  ApiDataResponse,
  ApiPaginatedResponse,
} from '../common/http/api-contracts';
import { UserRole } from '../users/enums/user-role.enum';
import {
  CreateInspectionCategoryRequestDto,
  InspectionCategoryQueryDto,
  UpdateInspectionCategoryRequestDto,
} from './dto/inspection-category-request.dtos';
import type { InspectionCategoryResponse } from './inspection-category-response.mapper';
import { InspectionCategoriesService } from './inspection-categories.service';

@Controller('admin/inspection-vehicle-categories')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminInspectionCategoriesController {
  constructor(
    private readonly inspectionCategoriesService: InspectionCategoriesService,
  ) {}

  @Get()
  async list(
    @Query() input: InspectionCategoryQueryDto,
  ): Promise<ApiPaginatedResponse<InspectionCategoryResponse>> {
    const result = await this.inspectionCategoriesService.list(input);

    return createPaginatedResponse(result.data, result.meta);
  }

  @Get(':categoryId')
  async getById(
    @Param('categoryId', new ParseUUIDPipe({ version: '4' }))
    categoryId: string,
  ): Promise<ApiDataResponse<InspectionCategoryResponse>> {
    return createDataResponse(
      await this.inspectionCategoriesService.getById(categoryId),
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() input: CreateInspectionCategoryRequestDto,
  ): Promise<ApiDataResponse<InspectionCategoryResponse>> {
    return createDataResponse(
      await this.inspectionCategoriesService.create(input),
    );
  }

  @Patch(':categoryId')
  async update(
    @Param('categoryId', new ParseUUIDPipe({ version: '4' }))
    categoryId: string,
    @Body() input: UpdateInspectionCategoryRequestDto,
  ): Promise<ApiDataResponse<InspectionCategoryResponse>> {
    return createDataResponse(
      await this.inspectionCategoriesService.update(categoryId, input),
    );
  }
}
