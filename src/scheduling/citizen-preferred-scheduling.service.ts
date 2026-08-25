import { ConfigService } from '@nestjs/config';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, type EntityManager, type Repository } from 'typeorm';

import type { EnvironmentVariables } from '../config/environment.validation';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { InspectionStation } from './entities/inspection-station.entity';
import { InspectionStationDailyCapacity } from './entities/inspection-station-daily-capacity.entity';

const PHNOM_PENH_TIME_ZONE = 'Asia/Phnom_Penh';
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface CitizenPreferredInspectionDate {
  stationId: string;
  capacityDate: string;
}

@Injectable()
export class CitizenPreferredSchedulingService {
  constructor(
    @InjectRepository(InspectionStation)
    private readonly stations: Repository<InspectionStation>,
    @InjectRepository(InspectionStationDailyCapacity)
    private readonly dailyCapacities: Repository<InspectionStationDailyCapacity>,
    private readonly configService: ConfigService<EnvironmentVariables>,
  ) {}

  async listPreferredDates(
    stationId: string,
  ): Promise<CitizenPreferredInspectionDate[]> {
    await this.requireActiveStation(this.stations, stationId);

    const { earliest, latest } = this.bounds();
    const closures = await this.dailyCapacities.find({
      select: { capacityDate: true },
      where: {
        stationId,
        isClosed: true,
        capacityDate: Between(earliest, latest),
      },
    });
    const closedDates = new Set(
      closures.map((closure) => closure.capacityDate),
    );

    return calendarDates(earliest, this.windowDays())
      .filter((date) => isWeekday(date) && !closedDates.has(date))
      .map((capacityDate) => ({ stationId, capacityDate }));
  }

  async validatePreferredDateWithManager(
    manager: EntityManager,
    stationId: string,
    capacityDate: string,
  ): Promise<void> {
    await this.requireActiveStation(
      manager.getRepository(InspectionStation),
      stationId,
    );

    const { earliest, latest } = this.bounds();
    if (
      !isCalendarDate(capacityDate) ||
      capacityDate < earliest ||
      capacityDate > latest ||
      !isWeekday(capacityDate)
    ) {
      throw this.dateNotSelectable();
    }

    const closure = await manager
      .getRepository(InspectionStationDailyCapacity)
      .findOne({ where: { stationId, capacityDate, isClosed: true } });
    if (closure !== null) throw this.dateNotSelectable();
  }

  private bounds(): { earliest: string; latest: string } {
    const today = cambodiaToday();
    return {
      earliest: addCalendarDays(today, 1),
      latest: addCalendarDays(today, this.windowDays()),
    };
  }

  private windowDays(): number {
    return this.configService.getOrThrow<number>(
      'PREFERRED_SCHEDULING_WINDOW_DAYS',
    );
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
      'Inspection station preferred date is not currently selectable',
    );
  }
}

function cambodiaToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PHNOM_PENH_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes): string => {
    const value = parts.find((candidate) => candidate.type === type)?.value;
    if (value === undefined) throw new Error(`Missing Cambodia ${type}.`);
    return value;
  };

  return `${part('year')}-${part('month')}-${part('day')}`;
}

function addCalendarDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const result = new Date(Date.UTC(year, month - 1, day));
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function calendarDates(firstDate: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    addCalendarDays(firstDate, index),
  );
}

function isCalendarDate(value: string): boolean {
  if (!DATE_ONLY_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

function isWeekday(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day >= 1 && day <= 5;
}
