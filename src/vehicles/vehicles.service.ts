import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { normalizeCambodianPhone } from '../auth/identifier-normalization';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { createPaginationMeta } from '../common/pagination/pagination-meta';
import { InspectionVehicleCategory } from '../inspection-categories/entities/inspection-vehicle-category.entity';
import type { SortOrder } from '../common/pagination/base-pagination-query.dto';
import {
  type CreateVehicleRequestDto,
  type ListAdminVehiclesQueryDto,
  type ListCitizenVehiclesQueryDto,
  type UpdateVehicleTechnicalDataRequestDto,
  type VehicleSortField,
} from './dto/vehicle-request.dtos';
import { Vehicle } from './entities/vehicle.entity';
import { VehiclePlateCategory } from './enums/vehicle-plate-category.enum';
import {
  mapVehicle,
  mapVehicleDetail,
  type VehicleDetailResponse,
  type VehicleResponse,
} from './vehicle-response.mapper';
import {
  normalizeVehicleIdentifier,
  trimRequiredVehicleText,
} from './vehicle-normalization';
import { utcDateStart, utcDateStartOfNextDay } from './vehicle-date';
import { normalizePlateNumber, normalizePlateProvince } from './vehicle-plate';

const REGISTRATION_UNIQUE_CONSTRAINT = 'UQ_2abf18fae2b9477bc1927675311';
const CHASSIS_UNIQUE_CONSTRAINT = 'UQ_90d5b70f93e2d5e4517020c2dff';
const PROVINCE_PLATE_UNIQUE_INDEX = 'uq_vehicles_province_plate_identity';
const PERSONALIZED_PLATE_UNIQUE_INDEX = 'uq_vehicles_personalized_plate_number';

@Injectable()
export class VehiclesService {
  constructor(
    @InjectRepository(Vehicle)
    private readonly vehicles: Repository<Vehicle>,
  ) {}

  async createCitizenVehicle(
    citizenId: string,
    input: CreateVehicleRequestDto,
  ): Promise<VehicleResponse> {
    const normalized = this.normalizeCreateInput(input);

    await this.assertNoUniqueConflict(normalized);

    try {
      const vehicle = await this.vehicles.save(
        this.vehicles.create({
          linkedCitizenId: citizenId,
          registrationNumber: normalized.registrationNumber,
          plateNumber: normalized.plateNumber,
          plateCategory: normalized.plateCategory,
          plateProvince: normalized.plateProvince,
          plateType: normalized.plateType,
          vehicleType: normalized.vehicleType,
          make: normalized.make,
          model: normalized.model,
          manufactureYear: normalized.manufactureYear ?? null,
          chassisNumber: normalized.chassisNumber,
          firstRegistrationDate: normalized.firstRegistrationDate,
          lastInspectionDate: normalized.lastInspectionDate ?? null,
          inspectionExpiryDate: normalized.inspectionExpiryDate,
          registeredOwnerNameKh: normalized.registeredOwnerNameKh,
          registeredOwnerNameEn: normalized.registeredOwnerNameEn,
          registeredOwnerPhone: normalized.registeredOwnerPhone,
        }),
      );

      return mapVehicle(vehicle);
    } catch (error) {
      const conflict = this.uniqueConflictFor(error);

      if (conflict !== null) {
        throw conflict;
      }

      throw error;
    }
  }

  async listCitizenVehicles(
    citizenId: string,
    input: ListCitizenVehiclesQueryDto,
  ): Promise<VehicleListResult> {
    const query = this.vehicleQuery().andWhere(
      'vehicle.linkedCitizenId = :citizenId',
      { citizenId },
    );

    if (input.search !== undefined) {
      this.vehicleSearchTokens(input.search).forEach((token, index) => {
        const textParameter = `searchText${index}`;
        const yearParameter = `searchYear${index}`;

        query.andWhere(
          `(vehicle.plateNumber ILIKE :${textParameter} OR vehicle.registrationNumber ILIKE :${textParameter} OR vehicle.make ILIKE :${textParameter} OR vehicle.model ILIKE :${textParameter} OR CAST(vehicle.manufactureYear AS TEXT) = :${yearParameter})`,
          {
            [textParameter]: `%${token}%`,
            [yearParameter]: token,
          },
        );
      });
    }

    if (input.registrationNumber !== undefined) {
      query.andWhere('vehicle.registrationNumber = :registrationNumber', {
        registrationNumber: normalizeVehicleIdentifier(
          input.registrationNumber,
        ),
      });
    }

    if (input.chassisNumber !== undefined) {
      query.andWhere('vehicle.chassisNumber = :chassisNumber', {
        chassisNumber: normalizeVehicleIdentifier(input.chassisNumber),
      });
    }

    if (input.plateCategory !== undefined) {
      query.andWhere('vehicle.plateCategory = :plateCategory', {
        plateCategory: input.plateCategory,
      });
    }

    if (input.plateProvince !== undefined) {
      query.andWhere('vehicle.plateProvince = :plateProvince', {
        plateProvince: normalizePlateProvince(input.plateProvince),
      });
    }

    if (input.plateNumber !== undefined) {
      query.andWhere('vehicle.plateNumber = :plateNumber', {
        plateNumber: normalizePlateNumber(input.plateNumber),
      });
    }

    if (input.firstRegistrationDate !== undefined) {
      query.andWhere('vehicle.firstRegistrationDate = :firstRegistrationDate', {
        firstRegistrationDate: input.firstRegistrationDate,
      });
    }

    return this.executeList(
      query,
      input,
      this.citizenSortTiebreak(input.sortBy),
    );
  }

  async getCitizenVehicle(
    citizenId: string,
    vehicleId: string,
  ): Promise<VehicleDetailResponse> {
    const vehicle = await this.findVehicleById(vehicleId);

    if (vehicle === null) {
      throw this.vehicleNotFound();
    }

    if (vehicle.linkedCitizenId !== citizenId) {
      throw new DomainException(
        ApiErrorCode.RESOURCE_NOT_OWNED,
        HttpStatus.FORBIDDEN,
        'Vehicle is outside the citizen ownership scope',
      );
    }

    return mapVehicleDetail(vehicle);
  }

  async listAdminVehicles(
    input: ListAdminVehiclesQueryDto,
  ): Promise<VehicleListResult> {
    this.assertCreatedRange(input);

    const query = this.vehicleQuery();

    if (input.linkedCitizenId !== undefined) {
      query.andWhere('vehicle.linkedCitizenId = :linkedCitizenId', {
        linkedCitizenId: input.linkedCitizenId,
      });
    }

    if (input.registrationNumber !== undefined) {
      query.andWhere('vehicle.registrationNumber = :registrationNumber', {
        registrationNumber: normalizeVehicleIdentifier(
          input.registrationNumber,
        ),
      });
    }

    if (input.chassisNumber !== undefined) {
      query.andWhere('vehicle.chassisNumber = :chassisNumber', {
        chassisNumber: normalizeVehicleIdentifier(input.chassisNumber),
      });
    }

    if (input.plateNumber !== undefined) {
      query.andWhere('vehicle.plateNumber = :plateNumber', {
        plateNumber: normalizeVehicleIdentifier(input.plateNumber),
      });
    }

    if (input.createdFrom !== undefined) {
      query.andWhere('vehicle.createdAt >= :createdFrom', {
        createdFrom: utcDateStart(input.createdFrom),
      });
    }

    if (input.createdTo !== undefined) {
      query.andWhere('vehicle.createdAt < :createdToExclusive', {
        createdToExclusive: utcDateStartOfNextDay(input.createdTo),
      });
    }

    return this.executeList(query, input);
  }

  async getAdminVehicle(vehicleId: string): Promise<VehicleDetailResponse> {
    const vehicle = await this.findVehicleById(vehicleId);

    if (vehicle === null) {
      throw this.vehicleNotFound();
    }

    return mapVehicleDetail(vehicle);
  }

  async updateTechnicalData(
    vehicleId: string,
    input: UpdateVehicleTechnicalDataRequestDto,
  ): Promise<VehicleDetailResponse> {
    if (!Object.values(input).some((value) => value !== undefined)) {
      throw new DomainException(
        ApiErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        'At least one technical vehicle field is required',
      );
    }

    const vehicle = await this.findVehicleById(vehicleId);
    if (vehicle === null) throw this.vehicleNotFound();

    if (input.colour !== undefined) {
      vehicle.colour = this.normalizedNullableText(input.colour, 'Colour');
    }
    if (input.engineNumber !== undefined) {
      vehicle.engineNumber =
        input.engineNumber === null
          ? null
          : normalizeVehicleIdentifier(input.engineNumber);
    }
    if (input.numberOfCylinders !== undefined) {
      vehicle.numberOfCylinders = input.numberOfCylinders;
    }
    if (input.engineDisplacementCc !== undefined) {
      vehicle.engineDisplacementCc = input.engineDisplacementCc;
    }
    if (input.enginePowerHp !== undefined) {
      vehicle.enginePowerHp = this.normalizedNullableText(
        input.enginePowerHp,
        'Engine power',
      );
    }
    if (input.fuelType !== undefined) {
      vehicle.fuelType = this.normalizedNullableText(
        input.fuelType,
        'Fuel type',
      );
    }
    if (input.numberOfSeats !== undefined) {
      vehicle.numberOfSeats = input.numberOfSeats;
    }
    if (input.numberOfAxles !== undefined) {
      vehicle.numberOfAxles = input.numberOfAxles;
    }
    if (input.steering !== undefined) {
      vehicle.steering = this.normalizedNullableText(
        input.steering,
        'Steering',
      );
    }
    if (input.vehicleWeightKg !== undefined) {
      vehicle.vehicleWeightKg = input.vehicleWeightKg;
    }
    if (input.maximumLoadKg !== undefined) {
      vehicle.maximumLoadKg = input.maximumLoadKg;
    }
    if (input.maximumGrossWeightKg !== undefined) {
      vehicle.maximumGrossWeightKg = input.maximumGrossWeightKg;
    }
    if (input.wheelSize !== undefined) {
      vehicle.wheelSize = this.normalizedNullableText(
        input.wheelSize,
        'Wheel size',
      );
    }
    if (input.lengthMm !== undefined) {
      vehicle.lengthMm = input.lengthMm;
    }
    if (input.widthMm !== undefined) {
      vehicle.widthMm = input.widthMm;
    }
    if (input.heightMm !== undefined) {
      vehicle.heightMm = input.heightMm;
    }

    return mapVehicleDetail(await this.vehicles.save(vehicle));
  }

  private vehicleQuery(includeTechnicalData = false) {
    const query = this.vehicles
      .createQueryBuilder('vehicle')
      .leftJoinAndMapOne(
        'vehicle.inspectionCategory',
        InspectionVehicleCategory,
        'inspectionCategory',
        'inspectionCategory.id = vehicle.inspectionCategoryId',
      )
      .select([
        'vehicle.id',
        'vehicle.linkedCitizenId',
        'vehicle.registrationNumber',
        'vehicle.plateNumber',
        'vehicle.plateCategory',
        'vehicle.plateProvince',
        'vehicle.plateType',
        'vehicle.vehicleType',
        'vehicle.vehicleClass',
        'vehicle.inspectionCategoryId',
        'vehicle.classificationVerifiedAt',
        'vehicle.make',
        'vehicle.model',
        'vehicle.manufactureYear',
        'vehicle.chassisNumber',
        'vehicle.firstRegistrationDate',
        'vehicle.lastInspectionDate',
        'vehicle.inspectionExpiryDate',
        'vehicle.registeredOwnerNameKh',
        'vehicle.registeredOwnerNameEn',
        'vehicle.registeredOwnerPhone',
        'vehicle.isActive',
        'vehicle.createdAt',
        'vehicle.updatedAt',
        'inspectionCategory.id',
        'inspectionCategory.nameKh',
        'inspectionCategory.nameEn',
      ]);

    if (includeTechnicalData) {
      query.addSelect([
        'vehicle.colour',
        'vehicle.engineNumber',
        'vehicle.numberOfCylinders',
        'vehicle.engineDisplacementCc',
        'vehicle.enginePowerHp',
        'vehicle.fuelType',
        'vehicle.numberOfSeats',
        'vehicle.numberOfAxles',
        'vehicle.steering',
        'vehicle.vehicleWeightKg',
        'vehicle.maximumLoadKg',
        'vehicle.maximumGrossWeightKg',
        'vehicle.wheelSize',
        'vehicle.lengthMm',
        'vehicle.widthMm',
        'vehicle.heightMm',
      ]);
    }

    return query;
  }

  private vehicleSearchTokens(search: string): string[] {
    return search.trim().split(/\s+/).filter(Boolean);
  }

  private async executeList(
    query: ReturnType<VehiclesService['vehicleQuery']>,
    input: ListCitizenVehiclesQueryDto | ListAdminVehiclesQueryDto,
    tiebreak?: VehicleOrdering,
  ): Promise<VehicleListResult> {
    const orderedQuery = query.orderBy(
      `vehicle.${this.vehicleSortColumn(input.sortBy)}`,
      input.sortOrder.toUpperCase() as 'ASC' | 'DESC',
    );

    if (tiebreak !== undefined) {
      orderedQuery.addOrderBy(
        `vehicle.${tiebreak.column}`,
        tiebreak.order.toUpperCase() as 'ASC' | 'DESC',
      );
    }

    const [vehicles, total] = await orderedQuery
      .skip((input.page - 1) * input.limit)
      .take(input.limit)
      .getManyAndCount();

    return {
      data: vehicles.map(mapVehicle),
      meta: createPaginationMeta(input.page, input.limit, total),
    };
  }

  private async findVehicleById(vehicleId: string): Promise<Vehicle | null> {
    return this.vehicleQuery(true)
      .where('vehicle.id = :vehicleId', { vehicleId })
      .getOne();
  }

  private normalizeCreateInput(input: CreateVehicleRequestDto) {
    return {
      registrationNumber: normalizeVehicleIdentifier(input.registrationNumber),
      plateNumber: normalizePlateNumber(input.plateNumber),
      plateCategory: input.plateCategory,
      plateProvince:
        input.plateCategory === VehiclePlateCategory.PERSONALIZED_CAMBODIA
          ? null
          : normalizePlateProvince(input.plateProvince ?? ''),
      plateType: trimRequiredVehicleText(input.plateType, 'Plate type'),
      vehicleType: trimRequiredVehicleText(input.vehicleType, 'Vehicle type'),
      make: trimRequiredVehicleText(input.make, 'Make'),
      model: trimRequiredVehicleText(input.model, 'Model'),
      manufactureYear: input.manufactureYear,
      chassisNumber: normalizeVehicleIdentifier(input.chassisNumber),
      firstRegistrationDate: input.firstRegistrationDate,
      lastInspectionDate: input.lastInspectionDate,
      inspectionExpiryDate: input.inspectionExpiryDate,
      registeredOwnerNameKh: trimRequiredVehicleText(
        input.registeredOwnerNameKh,
        'Registered owner Khmer name',
      ),
      registeredOwnerNameEn: trimRequiredVehicleText(
        input.registeredOwnerNameEn,
        'Registered owner English name',
      ),
      registeredOwnerPhone: normalizeCambodianPhone(input.registeredOwnerPhone),
    };
  }

  private normalizedNullableText(
    value: string | null,
    label: string,
  ): string | null {
    return value === null ? null : trimRequiredVehicleText(value, label);
  }

  private async assertNoUniqueConflict(input: {
    registrationNumber: string;
    chassisNumber: string;
    plateCategory: VehiclePlateCategory;
    plateProvince: string | null;
    plateType: string;
    plateNumber: string;
  }): Promise<void> {
    if (
      await this.vehicles.existsBy({
        registrationNumber: input.registrationNumber,
      })
    ) {
      throw this.registrationConflict();
    }

    if (await this.vehicles.existsBy({ chassisNumber: input.chassisNumber })) {
      throw this.chassisConflict();
    }

    const plateExists =
      input.plateCategory === VehiclePlateCategory.PROVINCE
        ? await this.vehicles.existsBy({
            plateCategory: input.plateCategory,
            plateProvince: input.plateProvince ?? '',
            plateNumber: input.plateNumber,
          })
        : await this.vehicles.existsBy({
            plateCategory: input.plateCategory,
            plateNumber: input.plateNumber,
          });

    if (plateExists) {
      throw this.plateConflict();
    }
  }

  private assertCreatedRange(input: ListAdminVehiclesQueryDto): void {
    if (
      input.createdFrom !== undefined &&
      input.createdTo !== undefined &&
      input.createdFrom > input.createdTo
    ) {
      throw new DomainException(
        ApiErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        'Created date range is invalid',
      );
    }
  }

  private vehicleSortColumn(sortBy: VehicleSortField): VehicleSortField {
    return sortBy;
  }

  private citizenSortTiebreak(
    sortBy: VehicleSortField,
  ): VehicleOrdering | undefined {
    return sortBy === 'inspectionExpiryDate'
      ? { column: 'updatedAt', order: 'desc' }
      : undefined;
  }

  private uniqueConflictFor(error: unknown): DomainException | null {
    const databaseError = this.databaseError(error);

    if (databaseError?.code !== '23505') {
      return null;
    }

    switch (databaseError.constraint) {
      case REGISTRATION_UNIQUE_CONSTRAINT:
        return this.registrationConflict();
      case CHASSIS_UNIQUE_CONSTRAINT:
        return this.chassisConflict();
      case PROVINCE_PLATE_UNIQUE_INDEX:
      case PERSONALIZED_PLATE_UNIQUE_INDEX:
        return this.plateConflict();
      default:
        return null;
    }
  }

  private databaseError(error: unknown): {
    code?: unknown;
    constraint?: unknown;
  } | null {
    if (typeof error !== 'object' || error === null) {
      return null;
    }

    const candidate = error as {
      code?: unknown;
      constraint?: unknown;
      driverError?: { code?: unknown; constraint?: unknown };
    };

    return candidate.driverError ?? candidate;
  }

  private vehicleNotFound(): DomainException {
    return new DomainException(
      ApiErrorCode.VEHICLE_NOT_FOUND,
      HttpStatus.NOT_FOUND,
      'Vehicle not found',
    );
  }

  private registrationConflict(): DomainException {
    return new DomainException(
      ApiErrorCode.VEHICLE_REGISTRATION_CONFLICT,
      HttpStatus.CONFLICT,
      'Vehicle registration conflicts with an existing vehicle',
    );
  }

  private chassisConflict(): DomainException {
    return new DomainException(
      ApiErrorCode.VEHICLE_CHASSIS_CONFLICT,
      HttpStatus.CONFLICT,
      'Vehicle chassis conflicts with an existing vehicle',
    );
  }

  private plateConflict(): DomainException {
    return new DomainException(
      ApiErrorCode.VEHICLE_PLATE_CONFLICT,
      HttpStatus.CONFLICT,
      'Vehicle plate conflicts with an existing vehicle',
    );
  }
}

interface VehicleListResult {
  data: VehicleResponse[];
  meta: ReturnType<typeof createPaginationMeta>;
}

interface VehicleOrdering {
  column: VehicleSortField;
  order: SortOrder;
}
