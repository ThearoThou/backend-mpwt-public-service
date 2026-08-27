import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, type Repository } from 'typeorm';

import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { InspectionServiceClosure } from './entities/inspection-service-closure.entity';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class InspectionCalendarService {
  constructor(
    @InjectRepository(InspectionServiceClosure)
    private readonly closures: Repository<InspectionServiceClosure>,
  ) {}

  async listActiveClosures(
    from: string,
    to: string,
  ): Promise<InspectionServiceClosure[]> {
    if (!isCalendarDate(from) || !isCalendarDate(to) || from > to) {
      throw new DomainException(
        ApiErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        'Closure date range must use real ISO dates with from on or before to',
      );
    }

    return this.closures.find({
      select: {
        closureDate: true,
        reasonKh: true,
        reasonEn: true,
      },
      where: { isActive: true, closureDate: Between(from, to) },
      order: { closureDate: 'ASC' },
    });
  }

  async isActiveClosure(closureDate: string): Promise<boolean> {
    return (
      (await this.closures.findOne({
        where: { closureDate, isActive: true },
      })) !== null
    );
  }
}

export function isCalendarDate(value: string): boolean {
  if (!DATE_ONLY_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}
