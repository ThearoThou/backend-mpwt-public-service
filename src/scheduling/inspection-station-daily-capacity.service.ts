import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, FindManyOptions, Repository } from 'typeorm';

import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { InspectionStation } from './entities/inspection-station.entity';
import { InspectionStationDailyCapacity } from './entities/inspection-station-daily-capacity.entity';

const DAILY_CAPACITY_UNIQUE_CONSTRAINT =
  'uq_inspection_station_daily_capacities_station_date';

export interface CreateInspectionStationDailyCapacityInput {
  stationId: string;
  capacityDate: string;
  dailyCapacity: number;
}

export interface ReservedInspectionStationDailyCapacity {
  id: string;
  stationId: string;
  capacityDate: string;
}

@Injectable()
export class InspectionStationDailyCapacityService {
  constructor(
    @InjectRepository(InspectionStationDailyCapacity)
    private readonly dailyCapacities: Repository<InspectionStationDailyCapacity>,
    @InjectRepository(InspectionStation)
    private readonly stations: Repository<InspectionStation>,
  ) {}

  async list(stationId?: string): Promise<InspectionStationDailyCapacity[]> {
    const options: FindManyOptions<InspectionStationDailyCapacity> = {
      order: { capacityDate: 'ASC', id: 'ASC' },
    };

    if (stationId !== undefined) {
      options.where = { stationId };
    }

    return this.dailyCapacities.find(options);
  }

  async getById(
    dailyCapacityId: string,
  ): Promise<InspectionStationDailyCapacity> {
    return this.findById(dailyCapacityId);
  }

  async create(
    input: CreateInspectionStationDailyCapacityInput,
  ): Promise<InspectionStationDailyCapacity> {
    this.requirePositiveIntegerCapacity(input.dailyCapacity);

    if (!(await this.stations.existsBy({ id: input.stationId }))) {
      throw this.stationNotFound();
    }

    try {
      return await this.dailyCapacities.save(
        this.dailyCapacities.create({
          stationId: input.stationId,
          capacityDate: input.capacityDate,
          dailyCapacity: input.dailyCapacity,
          reservedCount: 0,
          isClosed: false,
        }),
      );
    } catch (error) {
      if (this.isDailyCapacityConflict(error)) {
        throw this.dailyCapacityExists();
      }

      throw error;
    }
  }

  async updateDailyCapacity(
    dailyCapacityId: string,
    dailyCapacity: number,
  ): Promise<InspectionStationDailyCapacity> {
    this.requirePositiveIntegerCapacity(dailyCapacity);

    const result = await this.dailyCapacities
      .createQueryBuilder()
      .update(InspectionStationDailyCapacity)
      .set({
        dailyCapacity,
        updatedAt: () => 'now()',
      })
      .where('"id" = :dailyCapacityId', { dailyCapacityId })
      .andWhere(':dailyCapacity > 0', { dailyCapacity })
      .andWhere(':dailyCapacity >= "reserved_count"', { dailyCapacity })
      .returning(['id'])
      .execute();

    if (result.affected === 0) {
      if (!(await this.dailyCapacities.existsBy({ id: dailyCapacityId }))) {
        throw this.dailyCapacityNotFound();
      }

      throw this.dailyCapacityBelowReservedCount();
    }

    return this.findById(dailyCapacityId);
  }

  async closeDailyCapacity(
    dailyCapacityId: string,
  ): Promise<InspectionStationDailyCapacity> {
    return this.setClosed(dailyCapacityId, true);
  }

  async reopenDailyCapacity(
    dailyCapacityId: string,
  ): Promise<InspectionStationDailyCapacity> {
    return this.setClosed(dailyCapacityId, false);
  }

  async reserveDailyCapacityWithManager(
    manager: EntityManager,
    stationId: string,
    capacityDate: string,
  ): Promise<ReservedInspectionStationDailyCapacity | null> {
    const [rows] = await manager.query<
      [ReservedInspectionStationDailyCapacity[], number]
    >(
      `
        UPDATE "inspection_station_daily_capacities" AS capacity
        SET
          "reserved_count" = capacity."reserved_count" + 1,
          "updated_at" = now()
        FROM "inspection_stations" AS station
        WHERE capacity."station_id" = $1
          AND capacity."capacity_date" = $2
          AND station."id" = capacity."station_id"
          AND station."is_active" = true
          AND capacity."capacity_date" > ((now() AT TIME ZONE 'Asia/Phnom_Penh')::date)
          AND capacity."is_closed" = false
          AND capacity."reserved_count" < capacity."daily_capacity"
        RETURNING
          capacity."id" AS "id",
          capacity."station_id" AS "stationId",
          capacity."capacity_date"::text AS "capacityDate"
      `,
      [stationId, capacityDate],
    );

    return rows[0] ?? null;
  }

  private async setClosed(
    dailyCapacityId: string,
    isClosed: boolean,
  ): Promise<InspectionStationDailyCapacity> {
    const result = await this.dailyCapacities.update(
      { id: dailyCapacityId },
      { isClosed },
    );

    if (result.affected === 0) {
      throw this.dailyCapacityNotFound();
    }

    return this.findById(dailyCapacityId);
  }

  private async findById(
    dailyCapacityId: string,
  ): Promise<InspectionStationDailyCapacity> {
    const dailyCapacity = await this.dailyCapacities.findOne({
      where: { id: dailyCapacityId },
    });

    if (dailyCapacity === null) {
      throw this.dailyCapacityNotFound();
    }

    return dailyCapacity;
  }

  private requirePositiveIntegerCapacity(dailyCapacity: number): void {
    if (!Number.isInteger(dailyCapacity) || dailyCapacity <= 0) {
      throw new DomainException(
        ApiErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        'Daily capacity must be a positive integer',
      );
    }
  }

  private stationNotFound(): DomainException {
    return new DomainException(
      ApiErrorCode.STATION_NOT_FOUND,
      HttpStatus.NOT_FOUND,
      'Inspection station not found',
    );
  }

  private dailyCapacityNotFound(): DomainException {
    return new DomainException(
      ApiErrorCode.RESOURCE_NOT_FOUND,
      HttpStatus.NOT_FOUND,
      'Inspection station daily capacity not found',
    );
  }

  private dailyCapacityExists(): DomainException {
    return new DomainException(
      ApiErrorCode.CONFLICT,
      HttpStatus.CONFLICT,
      'A daily capacity record already exists for this station and date',
    );
  }

  private dailyCapacityBelowReservedCount(): DomainException {
    return new DomainException(
      ApiErrorCode.CONFLICT,
      HttpStatus.CONFLICT,
      'Daily capacity cannot be lower than reserved count',
    );
  }

  private isDailyCapacityConflict(error: unknown): boolean {
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
      source.constraint === DAILY_CAPACITY_UNIQUE_CONSTRAINT
    );
  }
}
