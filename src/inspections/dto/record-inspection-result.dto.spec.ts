import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { InspectionResult } from '../enums/inspection-result.enum';
import { RecordInspectionResultDto } from './record-inspection-result.dto';

describe('RecordInspectionResultDto', () => {
  it('accepts PASS without a failure reason', async () => {
    expect(
      await validate(
        plainToInstance(RecordInspectionResultDto, {
          result: InspectionResult.PASS,
        }),
      ),
    ).toHaveLength(0);
  });

  it('rejects a failure reason for PASS', async () => {
    expect(
      await validate(
        plainToInstance(RecordInspectionResultDto, {
          result: InspectionResult.PASS,
          failureReason: 'Brake issue',
        }),
      ),
    ).not.toHaveLength(0);
  });

  it('trims and accepts a 1..500-character FAIL reason', async () => {
    const dto = plainToInstance(RecordInspectionResultDto, {
      result: InspectionResult.FAIL,
      failureReason: '  Brake issue  ',
    });

    expect(dto.failureReason).toBe('Brake issue');
    expect(await validate(dto)).toHaveLength(0);
  });

  it.each([undefined, '   ', 'x'.repeat(501)])(
    'rejects invalid FAIL reason %p',
    async (failureReason) => {
      expect(
        await validate(
          plainToInstance(RecordInspectionResultDto, {
            result: InspectionResult.FAIL,
            failureReason,
          }),
        ),
      ).not.toHaveLength(0);
    },
  );

  it('rejects an invalid result', async () => {
    expect(
      await validate(
        plainToInstance(RecordInspectionResultDto, { result: 'PENDING' }),
      ),
    ).not.toHaveLength(0);
  });
});
