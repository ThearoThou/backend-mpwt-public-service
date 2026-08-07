import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, type EntityManager, type Repository } from 'typeorm';

import { InspectionCategoriesService } from '../inspection-categories/inspection-categories.service';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { createPaginationMeta } from '../common/pagination/pagination-meta';
import {
  type ClassifyVehicleRequestDto,
  type VehicleClassificationHistoryQueryDto,
} from './dto/vehicle-request.dtos';
import { VehicleClassificationHistory } from './entities/vehicle-classification-history.entity';
import { Vehicle } from './entities/vehicle.entity';
import {
  mapVehicleClassificationHistory,
  type VehicleClassificationHistoryResponse,
} from './vehicle-classification-history-response.mapper';
import { mapVehicle, type VehicleResponse } from './vehicle-response.mapper';

@Injectable()
export class VehicleClassificationService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Vehicle)
    private readonly vehicles: Repository<Vehicle>,
    @InjectRepository(VehicleClassificationHistory)
    private readonly histories: Repository<VehicleClassificationHistory>,
    private readonly inspectionCategoriesService: InspectionCategoriesService,
  ) {}

  async classify(
    adminUserId: string,
    vehicleId: string,
    input: ClassifyVehicleRequestDto,
  ): Promise<VehicleResponse> {
    const reason = input.reason.trim();

    if (reason === '') {
      throw new DomainException(
        ApiErrorCode.CLASSIFICATION_REASON_REQUIRED,
        HttpStatus.BAD_REQUEST,
        'Classification reason is required',
      );
    }

    return this.dataSource.transaction(async (manager) =>
      this.classifyWithManager(manager, adminUserId, vehicleId, {
        inspectionCategoryId: input.inspectionCategoryId,
        reason,
      }),
    );
  }

  async listHistory(
    vehicleId: string,
    input: VehicleClassificationHistoryQueryDto,
  ): Promise<VehicleClassificationHistoryListResult> {
    if (!(await this.vehicles.existsBy({ id: vehicleId }))) {
      throw this.vehicleNotFound();
    }

    const [histories, total] = await this.histories
      .createQueryBuilder('history')
      .select([
        'history.id',
        'history.vehicleId',
        'history.previousVehicleClass',
        'history.newVehicleClass',
        'history.previousInspectionCategoryId',
        'history.newInspectionCategoryId',
        'history.changedByAdminId',
        'history.reason',
        'history.createdAt',
      ])
      .where('history.vehicleId = :vehicleId', { vehicleId })
      .orderBy('history.createdAt', 'DESC')
      .addOrderBy('history.id', 'DESC')
      .skip((input.page - 1) * input.limit)
      .take(input.limit)
      .getManyAndCount();

    return {
      data: histories.map(mapVehicleClassificationHistory),
      meta: createPaginationMeta(input.page, input.limit, total),
    };
  }

  private async classifyWithManager(
    manager: EntityManager,
    adminUserId: string,
    vehicleId: string,
    input: Pick<ClassifyVehicleRequestDto, 'inspectionCategoryId' | 'reason'>,
  ): Promise<VehicleResponse> {
    const vehicleRepository = manager.getRepository(Vehicle);
    const vehicle = await vehicleRepository.findOne({
      where: { id: vehicleId },
      lock: { mode: 'pessimistic_write' },
    });

    if (vehicle === null) {
      throw this.vehicleNotFound();
    }

    const category =
      await this.inspectionCategoriesService.findActiveByIdForClassificationWithManager(
        manager,
        input.inspectionCategoryId,
      );

    if (vehicle.inspectionCategoryId === category.id) {
      throw new DomainException(
        ApiErrorCode.VEHICLE_CLASSIFICATION_UNCHANGED,
        HttpStatus.CONFLICT,
        'Vehicle is already assigned to the requested inspection category',
      );
    }

    const previousVehicleClass = vehicle.vehicleClass;
    const previousInspectionCategoryId = vehicle.inspectionCategoryId;

    vehicle.vehicleClass = category.vehicleClass;
    vehicle.inspectionCategoryId = category.id;
    vehicle.classificationVerifiedAt = new Date();
    vehicle.classificationVerifiedBy = adminUserId;

    await vehicleRepository.save(vehicle);

    const historyRepository = manager.getRepository(
      VehicleClassificationHistory,
    );
    await historyRepository.save(
      historyRepository.create({
        vehicleId: vehicle.id,
        previousVehicleClass,
        previousInspectionCategoryId,
        newVehicleClass: category.vehicleClass,
        newInspectionCategoryId: category.id,
        changedByAdminId: adminUserId,
        reason: input.reason,
      }),
    );

    return mapVehicle(vehicle);
  }

  private vehicleNotFound(): DomainException {
    return new DomainException(
      ApiErrorCode.VEHICLE_NOT_FOUND,
      HttpStatus.NOT_FOUND,
      'Vehicle not found',
    );
  }
}

interface VehicleClassificationHistoryListResult {
  data: VehicleClassificationHistoryResponse[];
  meta: ReturnType<typeof createPaginationMeta>;
}
