import { HttpStatus } from '@nestjs/common';
import type { FindManyOptions } from 'typeorm';

import { ApiErrorCode } from '../common/errors/api-error-code';
import { InspectionServiceClosure } from './entities/inspection-service-closure.entity';
import { InspectionCalendarService } from './inspection-calendar.service';

describe('InspectionCalendarService', () => {
  it('returns only active closures in ascending date order for a cross-year range', async () => {
    const find = jest
      .fn<
        Promise<InspectionServiceClosure[]>,
        [FindManyOptions<InspectionServiceClosure>]
      >()
      .mockResolvedValue([]);
    const closures = {
      find,
      findOne: jest.fn(),
    };
    const service = new InspectionCalendarService(closures as never);

    await expect(
      service.listActiveClosures('2026-12-20', '2027-01-10'),
    ).resolves.toEqual([]);
    const options = find.mock.calls[0]?.[0];
    if (options === undefined) throw new Error('Expected a closure query.');
    expect(options.where.isActive).toBe(true);
    expect(options.where.closureDate).toBeDefined();
    expect(options.order).toEqual({ closureDate: 'ASC' });
    expect(options.select).toEqual({
      closureDate: true,
      reasonKh: true,
      reasonEn: true,
    });
  });

  it.each([
    ['invalid from', '2026-02-30', '2026-03-01'],
    ['invalid to', '2026-03-01', '2026-02-30'],
    ['inverted range', '2026-03-02', '2026-03-01'],
  ])('rejects %s', async (_reason, from, to) => {
    const service = new InspectionCalendarService({} as never);
    await expect(service.listActiveClosures(from, to)).rejects.toMatchObject({
      code: ApiErrorCode.VALIDATION_ERROR,
      status: HttpStatus.BAD_REQUEST,
    });
  });

  it('uses only an active global closure record when testing a date', async () => {
    const closures = {
      find: jest.fn(),
      findOne: jest.fn().mockResolvedValue(null),
    };
    const service = new InspectionCalendarService(closures as never);

    await expect(service.isActiveClosure('2026-08-24')).resolves.toBe(false);
    expect(closures.findOne).toHaveBeenCalledWith({
      where: { closureDate: '2026-08-24', isActive: true },
    });
  });
});
