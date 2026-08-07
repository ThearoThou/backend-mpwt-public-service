import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { normalizeCambodianPhone } from '../auth/identifier-normalization';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { createPaginationMeta } from '../common/pagination/pagination-meta';
import {
  type CreateVehicleRequestDto,
  type ListAdminVehiclesQueryDto,
  type ListCitizenVehiclesQueryDto,
  type VehicleSortField,
} from './dto/vehicle-request.dtos';
import { Vehicle } from './entities/vehicle.entity';
import { VehiclePlateCategory } from './enums/vehicle-plate-category.enum';
import { mapVehicle, type VehicleResponse } from './vehicle-response.mapper';
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

    return this.executeList(query, input);
  }

  async getCitizenVehicle(
    citizenId: string,
    vehicleId: string,
  ): Promise<VehicleResponse> {
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

    return mapVehicle(vehicle);
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

  async getAdminVehicle(vehicleId: string): Promise<VehicleResponse> {
    const vehicle = await this.findVehicleById(vehicleId);

    if (vehicle === null) {
      throw this.vehicleNotFound();
    }

    return mapVehicle(vehicle);
  }

  private vehicleQuery() {
    return this.vehicles
      .createQueryBuilder('vehicle')
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
      ]);
  }

  private async executeList(
    query: ReturnType<VehiclesService['vehicleQuery']>,
    input: ListCitizenVehiclesQueryDto | ListAdminVehiclesQueryDto,
  ): Promise<VehicleListResult> {
    const [vehicles, total] = await query
      .orderBy(
        `vehicle.${this.vehicleSortColumn(input.sortBy)}`,
        input.sortOrder.toUpperCase() as 'ASC' | 'DESC',
      )
      .skip((input.page - 1) * input.limit)
      .take(input.limit)
      .getManyAndCount();

    return {
      data: vehicles.map(mapVehicle),
      meta: createPaginationMeta(input.page, input.limit, total),
    };
  }

  private async findVehicleById(vehicleId: string): Promise<Vehicle | null> {
    return this.vehicles.findOne({
      where: { id: vehicleId },
      select: {
        id: true,
        linkedCitizenId: true,
        registrationNumber: true,
        plateNumber: true,
        plateCategory: true,
        plateProvince: true,
        plateType: true,
        vehicleType: true,
        vehicleClass: true,
        inspectionCategoryId: true,
        classificationVerifiedAt: true,
        make: true,
        model: true,
        manufactureYear: true,
        chassisNumber: true,
        firstRegistrationDate: true,
        lastInspectionDate: true,
        inspectionExpiryDate: true,
        registeredOwnerNameKh: true,
        registeredOwnerNameEn: true,
        registeredOwnerPhone: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
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
