import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BookReplacementInspectionDto } from './replacement-inspection.dto';

describe('BookReplacementInspectionDto', () => {
  it('accepts a UUID v4 and a real calendar date', async () => {
    expect(
      await validate(
        plainToInstance(BookReplacementInspectionDto, {
          stationId: '550e8400-e29b-41d4-a716-446655440000',
          capacityDate: '2026-02-28',
        }),
      ),
    ).toHaveLength(0);
  });
  it.each([
    { stationId: 'not-a-uuid', capacityDate: '2026-02-28' },
    {
      stationId: '550e8400-e29b-41d4-a716-446655440000',
      capacityDate: '2026-02-30',
    },
  ])('rejects invalid replacement input', async (input) => {
    expect(
      await validate(plainToInstance(BookReplacementInspectionDto, input)),
    ).not.toHaveLength(0);
  });
});
