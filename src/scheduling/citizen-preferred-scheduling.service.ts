import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, type Repository } from 'typeorm';

import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { InspectionStation } from './entities/inspection-station.entity';
import {
  InspectionCalendarService,
  isCalendarDate,
} from './inspection-calendar.service';
import { inspectionPolicy } from '../config/inspection-policy';
import {
  addCalendarDays,
  cambodiaCalendarDate,
  CAMBODIA_TIME_ZONE,
  getInitialApplicationLastValidDate,
} from '../applications/initial-application-expiry';

export const PREFERRED_INSPECTION_WINDOW_DAYS =
  inspectionPolicy.application.initialInspectionPeriodDays;
const PREFERRED_INSPECTION_LAST_DAY_OFFSET =
  PREFERRED_INSPECTION_WINDOW_DAYS - 1;

export interface CitizenPreferredInspectionDate {
  stationId: string;
  capacityDate: string;
}

@Injectable()
export class CitizenPreferredSchedulingService {
  constructor(
    @InjectRepository(InspectionStation)
    private readonly stations: Repository<InspectionStation>,
    private readonly calendar: InspectionCalendarService,
  ) {}

  async listPreferredDates(
    stationId: string,
  ): Promise<CitizenPreferredInspectionDate[]> {
    await this.requireActiveStation(this.stations, stationId);

    const { earliest } = this.bounds();
    const dates = await Promise.all(
      calendarDates(earliest, PREFERRED_INSPECTION_WINDOW_DAYS).map(
        async (capacityDate) => {
          try {
            await this.validatePreferredDate(capacityDate);
            return { stationId, capacityDate };
          } catch (error) {
            if (error instanceof DomainException) return null;
            throw error;
          }
        },
      ),
    );
    return dates.filter(
      (date): date is CitizenPreferredInspectionDate => date !== null,
    );
  }

  async validatePreferredDate(preferredInspectionDate: string): Promise<void> {
    const { earliest, latest } = this.bounds();
    if (
      !isCalendarDate(preferredInspectionDate) ||
      preferredInspectionDate < earliest ||
      preferredInspectionDate > latest ||
      !isWeekday(preferredInspectionDate) ||
      (preferredInspectionDate === earliest && isAfterDailyCutoff()) ||
      (await this.calendar.isActiveClosure(preferredInspectionDate))
    ) {
      throw this.dateNotSelectable();
    }
  }

  async validateOptionalStationWithManager(
    manager: EntityManager,
    stationId: string | null,
  ): Promise<void> {
    if (stationId === null) return;
    await this.requireActiveStation(
      manager.getRepository(InspectionStation),
      stationId,
    );
  }

  async validatePreferredDateForSubmission(
    preferredInspectionDate: string,
    submittedAt: Date,
  ): Promise<void> {
    // Day 1 is the Cambodia-local submission date, so the inclusive window is
    // submitted date through submitted date + 29 calendar days.
    const submittedDate = cambodiaCalendarDate(submittedAt);
    const lastAllowedDate = getInitialApplicationLastValidDate(submittedAt);
    if (
      !isCalendarDate(preferredInspectionDate) ||
      !isWeekday(preferredInspectionDate) ||
      preferredInspectionDate < submittedDate ||
      preferredInspectionDate > lastAllowedDate ||
      (preferredInspectionDate === submittedDate &&
        isAfterDailyCutoff(submittedAt)) ||
      (await this.calendar.isActiveClosure(preferredInspectionDate))
    ) {
      throw this.dateNotSelectable();
    }
  }

  private bounds(): { earliest: string; latest: string } {
    const today = cambodiaCalendarDate(new Date());
    return {
      earliest: today,
      latest: addCalendarDays(today, PREFERRED_INSPECTION_LAST_DAY_OFFSET),
    };
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

function calendarDates(firstDate: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    addCalendarDays(firstDate, index),
  );
}

function isWeekday(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day >= 1 && day <= 5;
}

function isAfterDailyCutoff(now = new Date()): boolean {
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: CAMBODIA_TIME_ZONE,
    hour: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(now)
    .find((part) => part.type === 'hour')?.value;
  if (hour === undefined) throw new Error('Missing Cambodia hour.');
  return Number(hour) >= inspectionPolicy.scheduling.sameDayCutoffHour;
}
