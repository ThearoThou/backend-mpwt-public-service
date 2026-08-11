import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository, SelectQueryBuilder } from 'typeorm';

import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { InspectionStationDailyCapacity } from './entities/inspection-station-daily-capacity.entity';
import { InspectionStation } from './entities/inspection-station.entity';

export interface CitizenSelectableInspectionDate {
  stationId: string;
  capacityDate: string;
}

@Injectable()
export class CitizenSchedulingAvailabilityService {
  constructor(
    @InjectRepository(InspectionStation)
    private readonly stations: Repository<InspectionStation>,
    @InjectRepository(InspectionStationDailyCapacity)
    private readonly dailyCapacities: Repository<InspectionStationDailyCapacity>,
  ) {}

  async listActiveStations(): Promise<InspectionStation[]> {
    return this.stations.find({
      where: { isActive: true },
      order: { code: 'ASC', id: 'ASC' },
    });
  }

  async listSelectableDates(
    stationId: string,
  ): Promise<CitizenSelectableInspectionDate[]> {
    await this.requireActiveStation(this.stations, stationId);

    const capacities = await this.selectableCapacityQuery(
      this.dailyCapacities,
      stationId,
    )
      .orderBy('capacity.capacityDate', 'ASC')
      .getMany();

    return capacities.map(({ stationId: capacityStationId, capacityDate }) => ({
      stationId: capacityStationId,
      capacityDate,
    }));
  }

  async validateSelectable(
    stationId: string,
    capacityDate: string,
  ): Promise<InspectionStationDailyCapacity> {
    return this.validateSelectableWithRepositories(
      this.stations,
      this.dailyCapacities,
      stationId,
      capacityDate,
    );
  }

  async validateSelectableWithManager(
    manager: EntityManager,
    stationId: string,
    capacityDate: string,
  ): Promise<InspectionStationDailyCapacity> {
    return this.validateSelectableWithRepositories(
      manager.getRepository(InspectionStation),
      manager.getRepository(InspectionStationDailyCapacity),
      stationId,
      capacityDate,
    );
  }

  private async validateSelectableWithRepositories(
    stations: Repository<InspectionStation>,
    dailyCapacities: Repository<InspectionStationDailyCapacity>,
    stationId: string,
    capacityDate: string,
  ): Promise<InspectionStationDailyCapacity> {
    const capacity = await this.selectableCapacityQuery(
      dailyCapacities,
      stationId,
      capacityDate,
    ).getOne();

    if (capacity !== null) {
      return capacity;
    }

    await this.requireActiveStation(stations, stationId);
    throw this.dateNotSelectable();
  }

  private selectableCapacityQuery(
    dailyCapacities: Repository<InspectionStationDailyCapacity>,
    stationId: string,
    capacityDate?: string,
  ): SelectQueryBuilder<InspectionStationDailyCapacity> {
    const query = dailyCapacities
      .createQueryBuilder('capacity')
      .innerJoin('capacity.station', 'station')
      .where('capacity.stationId = :stationId', { stationId })
      .andWhere('station.isActive = true')
      .andWhere(
        "capacity.capacityDate > ((now() AT TIME ZONE 'Asia/Phnom_Penh')::date)",
      )
      .andWhere('capacity.isClosed = false')
      .andWhere('capacity.reservedCount < capacity.dailyCapacity');

    if (capacityDate !== undefined) {
      query.andWhere('capacity.capacityDate = :capacityDate', {
        capacityDate,
      });
    }

    return query;
  }

  private async requireActiveStation(
    stations: Repository<InspectionStation>,
    stationId: string,
  ): Promise<void> {
    const station = await stations.findOne({
      where: { id: stationId, isActive: true },
    });

    if (station === null) {
      throw new DomainException(
        ApiErrorCode.STATION_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        'Inspection station not found',
      );
    }
  }

  private dateNotSelectable(): DomainException {
    return new DomainException(
      ApiErrorCode.CONFLICT,
      HttpStatus.CONFLICT,
      'Inspection station date is not currently selectable',
    );
  }
}
