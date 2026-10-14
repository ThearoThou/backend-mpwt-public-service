import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { normalizeCambodianPhone } from '../auth/identifier-normalization';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { createPaginationMeta } from '../common/pagination/pagination-meta';
import { InspectionVehicleCategory } from '../inspection-categories/entities/inspection-vehicle-category.entity';
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
const ACTIVE_CARD_CYCLE_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'CORRECTION_REQUIRED',
  'APPROVED',
] as const;
const CITIZEN_ACTION_REQUIRED_STATUSES = [
  'CORRECTION_REQUIRED',
  'DRAFT',
] as const;
const ACTIVE_PROCESSING_STATUSES = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
] as const;
const UNSUCCESSFUL_CYCLE_STATUSES = ['INSPECTION_FAILED', 'REJECTED'] as const;

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
          `(vehicle.plateNumber ILIKE :${textParameter} OR vehicle.plateProvince ILIKE :${textParameter} OR CONCAT_WS(' ', vehicle.plateProvince, vehicle.plateNumber) ILIKE :${textParameter} OR vehicle.registrationNumber ILIKE :${textParameter} OR vehicle.make ILIKE :${textParameter} OR vehicle.model ILIKE :${textParameter} OR CAST(vehicle.manufactureYear AS TEXT) = :${yearParameter} OR ${this.currentCardCycleIdentifierSearch(textParameter)})`,
          {
            [textParameter]: `%${token}%`,
            [yearParameter]: token,
          },
        );
      });
    }

    if (input.inspectionStatus !== undefined) {
      const today = `(now() AT TIME ZONE 'Asia/Phnom_Penh')::date`;
      if (input.inspectionStatus === 'expired') {
        query.andWhere(`vehicle.inspectionExpiryDate <= ${today}`);
      } else if (input.inspectionStatus === 'expiring') {
        query.andWhere(
          `vehicle.inspectionExpiryDate > ${today} AND vehicle.inspectionExpiryDate <= ${today} + 30`,
        );
      } else {
        query.andWhere(`vehicle.inspectionExpiryDate > ${today} + 30`);
      }
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

    return this.executeCitizenVehicleList(query, input);
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

  private currentCardCycleIdentifierSearch(textParameter: string): string {
    const activeStatuses = ACTIVE_CARD_CYCLE_STATUSES.map(
      (status) => `'${status}'`,
    ).join(', ');

    return `EXISTS (
      SELECT 1
      FROM (
        SELECT application.id
        FROM renewal_applications application
        WHERE application.vehicle_id = vehicle.id
          AND application.citizen_id = :citizenId
        ORDER BY
          CASE WHEN application.status IN (${activeStatuses}) THEN 0 ELSE 1 END ASC,
          application.updated_at DESC
        LIMIT 1
      ) current_cycle
      LEFT JOIN payments current_payment ON current_payment.application_id = current_cycle.id
      LEFT JOIN technical_inspection_certificates current_certificate ON current_certificate.application_id = current_cycle.id
      WHERE current_payment.invoice_number ILIKE :${textParameter}
         OR current_certificate.certificate_number ILIKE :${textParameter}
    )`;
  }

  private currentCardCycleColumn(
    column: 'id' | 'status' | 'preferred_inspection_date' | 'updated_at',
  ): string {
    const activeStatuses = this.sqlStrings(ACTIVE_CARD_CYCLE_STATUSES);
    return `(SELECT application.${column}
      FROM renewal_applications application
      WHERE application.vehicle_id = vehicle.id
        AND application.citizen_id = :citizenId
      ORDER BY
        CASE WHEN application.status IN (${activeStatuses}) THEN 0 ELSE 1 END ASC,
        application.updated_at DESC
      LIMIT 1)`;
  }

  private sqlStrings(values: readonly string[]): string {
    return values.map((value) => `'${value}'`).join(', ');
  }

  private async executeCitizenVehicleList(
    query: ReturnType<VehiclesService['vehicleQuery']>,
    input: ListCitizenVehiclesQueryDto,
  ): Promise<VehicleListResult> {
    const currentCycleId = this.currentCardCycleColumn('id');
    const currentStatus = this.currentCardCycleColumn('status');
    const currentPaymentStatus = `(SELECT payment.status
      FROM payments payment
      WHERE payment.application_id = ${currentCycleId}
      LIMIT 1)`;
    const cardPreferredInspectionDate = this.currentCardCycleColumn(
      'preferred_inspection_date',
    );
    const today = `(now() AT TIME ZONE 'Asia/Phnom_Penh')::date`;
    const preferredInspectionDate = `CASE
      WHEN ${cardPreferredInspectionDate} >= ${today} THEN ${cardPreferredInspectionDate}
      ELSE NULL
    END`;
    const relevantUpdatedAt = `COALESCE(${this.currentCardCycleColumn('updated_at')}, vehicle.updated_at)`;
    const priority = `CASE
      WHEN ${currentStatus} IN (${this.sqlStrings(CITIZEN_ACTION_REQUIRED_STATUSES)})
        OR ${currentPaymentStatus} IN ('REJECTED') THEN 1
      WHEN ${currentStatus} IN ('CANCELLED', 'EXPIRED') THEN 6
      WHEN ${currentStatus} IN (${this.sqlStrings(UNSUCCESSFUL_CYCLE_STATUSES)}) THEN 4
      WHEN ${currentStatus} IN (${this.sqlStrings(ACTIVE_PROCESSING_STATUSES)}) THEN 3
      WHEN ${currentStatus} IS NULL OR ${currentStatus} = 'COMPLETED' THEN
        CASE WHEN vehicle.inspection_expiry_date <= ${today} + 30 THEN 2 ELSE 5 END
      ELSE 5
    END`;

    const [vehicles, total] = await query
      .addSelect(priority, 'citizen_vehicle_priority')
      .addSelect(
        preferredInspectionDate,
        'citizen_vehicle_upcoming_inspection_date',
      )
      .addSelect(relevantUpdatedAt, 'citizen_vehicle_relevant_updated_at')
      .orderBy('citizen_vehicle_priority', 'ASC')
      .addOrderBy(
        'citizen_vehicle_upcoming_inspection_date',
        'ASC',
        'NULLS LAST',
      )
      .addOrderBy('citizen_vehicle_relevant_updated_at', 'DESC')
      .addOrderBy('vehicle.id', 'ASC')
      .skip((input.page - 1) * input.limit)
      .take(input.limit)
      .getManyAndCount();

    return {
      data: vehicles.map(mapVehicle),
      meta: createPaginationMeta(input.page, input.limit, total),
    };
  }

  private async executeList(
    query: ReturnType<VehiclesService['vehicleQuery']>,
    input: ListCitizenVehiclesQueryDto | ListAdminVehiclesQueryDto,
  ): Promise<VehicleListResult> {
    const orderedQuery = query.orderBy(
      `vehicle.${this.vehicleSortColumn(input.sortBy)}`,
      input.sortOrder.toUpperCase() as 'ASC' | 'DESC',
    );
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
