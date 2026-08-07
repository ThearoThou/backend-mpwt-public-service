import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';

import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { createPaginationMeta } from '../common/pagination/pagination-meta';
import {
  type CreateInspectionCategoryRequestDto,
  type InspectionCategoryQueryDto,
  type UpdateInspectionCategoryRequestDto,
} from './dto/inspection-category-request.dtos';
import { InspectionVehicleCategory } from './entities/inspection-vehicle-category.entity';
import {
  mapInspectionCategory,
  type InspectionCategoryResponse,
} from './inspection-category-response.mapper';

const CATEGORY_CODE_UNIQUE_CONSTRAINT = 'uq_inspection_vehicle_categories_code';

@Injectable()
export class InspectionCategoriesService {
  constructor(
    @InjectRepository(InspectionVehicleCategory)
    private readonly categories: Repository<InspectionVehicleCategory>,
  ) {}

  async list(
    input: InspectionCategoryQueryDto,
  ): Promise<InspectionCategoryListResult> {
    const [categories, total] = await this.categories
      .createQueryBuilder('category')
      .select(this.categorySelect())
      .orderBy(
        'category.createdAt',
        input.sortOrder.toUpperCase() as 'ASC' | 'DESC',
      )
      .addOrderBy(
        'category.id',
        input.sortOrder.toUpperCase() as 'ASC' | 'DESC',
      )
      .skip((input.page - 1) * input.limit)
      .take(input.limit)
      .getManyAndCount();

    return {
      data: categories.map(mapInspectionCategory),
      meta: createPaginationMeta(input.page, input.limit, total),
    };
  }

  async getById(categoryId: string): Promise<InspectionCategoryResponse> {
    return mapInspectionCategory(await this.findById(categoryId));
  }

  async create(
    input: CreateInspectionCategoryRequestDto,
  ): Promise<InspectionCategoryResponse> {
    const code = input.code.trim();

    if (await this.categories.existsBy({ code })) {
      throw this.categoryCodeExists();
    }

    try {
      const category = await this.categories.save(
        this.categories.create({
          code,
          nameKh: input.nameKh.trim(),
          nameEn: this.normalizedOptionalText(input.nameEn),
          vehicleClass: input.vehicleClass,
          validityMonths: input.validityMonths,
          inspectionFeeKhr: input.inspectionFeeKhr,
          serviceFeeKhr: input.serviceFeeKhr,
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        }),
      );

      return mapInspectionCategory(category);
    } catch (error) {
      if (this.isCategoryCodeConflict(error)) {
        throw this.categoryCodeExists();
      }

      throw error;
    }
  }

  async update(
    categoryId: string,
    input: UpdateInspectionCategoryRequestDto,
  ): Promise<InspectionCategoryResponse> {
    const category = await this.findById(categoryId);

    if (!this.hasMutableUpdate(input)) {
      throw new DomainException(
        ApiErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        'At least one mutable category field is required',
      );
    }

    if (input.nameKh !== undefined) {
      category.nameKh = input.nameKh.trim();
    }

    if (input.nameEn !== undefined) {
      category.nameEn = this.normalizedOptionalText(input.nameEn);
    }

    if (input.validityMonths !== undefined) {
      category.validityMonths = input.validityMonths;
    }

    if (input.inspectionFeeKhr !== undefined) {
      category.inspectionFeeKhr = input.inspectionFeeKhr;
    }

    if (input.serviceFeeKhr !== undefined) {
      category.serviceFeeKhr = input.serviceFeeKhr;
    }

    if (input.isActive !== undefined) {
      category.isActive = input.isActive;
    }

    return mapInspectionCategory(await this.categories.save(category));
  }

  /**
   * Requires a manager from an already active classification transaction.
   * This method deliberately does not open a nested transaction.
   */
  async findActiveByIdForClassificationWithManager(
    manager: EntityManager,
    categoryId: string,
  ): Promise<InspectionVehicleCategory> {
    const category = await manager
      .getRepository(InspectionVehicleCategory)
      .findOne({
        where: { id: categoryId },
        lock: { mode: 'pessimistic_read' },
      });

    if (category === null) {
      throw this.categoryNotFound();
    }

    if (!category.isActive) {
      throw new DomainException(
        ApiErrorCode.INSPECTION_CATEGORY_INACTIVE,
        HttpStatus.CONFLICT,
        'Inspection category is inactive',
      );
    }

    return category;
  }

  private async findById(
    categoryId: string,
  ): Promise<InspectionVehicleCategory> {
    const category = await this.categories.findOne({
      where: { id: categoryId },
    });

    if (category === null) {
      throw this.categoryNotFound();
    }

    return category;
  }

  private categorySelect() {
    return [
      'category.id',
      'category.code',
      'category.nameKh',
      'category.nameEn',
      'category.vehicleClass',
      'category.validityMonths',
      'category.inspectionFeeKhr',
      'category.serviceFeeKhr',
      'category.isActive',
      'category.createdAt',
      'category.updatedAt',
    ];
  }

  private normalizedOptionalText(
    value: string | null | undefined,
  ): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    const trimmed = value.trim();

    return trimmed === '' ? null : trimmed;
  }

  private hasMutableUpdate(input: UpdateInspectionCategoryRequestDto): boolean {
    return (
      input.nameKh !== undefined ||
      input.nameEn !== undefined ||
      input.validityMonths !== undefined ||
      input.inspectionFeeKhr !== undefined ||
      input.serviceFeeKhr !== undefined ||
      input.isActive !== undefined
    );
  }

  private categoryNotFound(): DomainException {
    return new DomainException(
      ApiErrorCode.INSPECTION_CATEGORY_NOT_FOUND,
      HttpStatus.NOT_FOUND,
      'Inspection category not found',
    );
  }

  private categoryCodeExists(): DomainException {
    return new DomainException(
      ApiErrorCode.INSPECTION_CATEGORY_CODE_EXISTS,
      HttpStatus.CONFLICT,
      'Inspection category code already exists',
    );
  }

  private isCategoryCodeConflict(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
      return false;
    }

    const databaseError = error as {
      code?: unknown;
      constraint?: unknown;
      driverError?: { code?: unknown; constraint?: unknown };
    };
    const source = databaseError.driverError ?? databaseError;

    return (
      source.code === '23505' &&
      source.constraint === CATEGORY_CODE_UNIQUE_CONSTRAINT
    );
  }
}

interface InspectionCategoryListResult {
  data: InspectionCategoryResponse[];
  meta: ReturnType<typeof createPaginationMeta>;
}
