import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { AdminInspectionQueueQueryDto } from './inspection-query.dtos';

describe('AdminInspectionQueueQueryDto', () => {
  it('defaults omitted view to PENDING with ascending pagination order', async () => {
    const dto = plainToInstance(AdminInspectionQueueQueryDto, {});

    expect(dto).toMatchObject({
      view: 'PENDING',
      page: 1,
      limit: 20,
      sortOrder: 'asc',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it.each(['PENDING', 'PASSED', 'FAILED'])('accepts %s view', async (view) => {
    expect(
      await validate(plainToInstance(AdminInspectionQueueQueryDto, { view })),
    ).toHaveLength(0);
  });

  it.each(['asc', 'desc'])('accepts %s sortOrder', async (sortOrder) => {
    expect(
      await validate(
        plainToInstance(AdminInspectionQueueQueryDto, { sortOrder }),
      ),
    ).toHaveLength(0);
  });

  it('accepts valid UUID and real calendar-date filters', async () => {
    expect(
      await validate(
        plainToInstance(AdminInspectionQueueQueryDto, {
          stationId: '550e8400-e29b-41d4-a716-446655440000',
          capacityDate: '2026-02-28',
        }),
      ),
    ).toHaveLength(0);
  });

  it('rejects invalid filters and retains base pagination validation', async () => {
    const invalid = plainToInstance(AdminInspectionQueueQueryDto, {
      view: 'COMPLETED',
      stationId: 'not-a-uuid',
      capacityDate: '2026-02-30',
      page: 0,
    });

    expect(await validate(invalid)).not.toHaveLength(0);
  });
});
