import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { InspectionResult } from '../enums/inspection-result.enum';
import { RecordApplicationInspectionResultDto } from './record-application-inspection-result.dto';

describe('RecordApplicationInspectionResultDto', () => {
  it('requires an actual station and inherits PASS/FAIL validation', async () => {
    const valid = plainToInstance(RecordApplicationInspectionResultDto, {
      actualStationId: '550e8400-e29b-41d4-a716-446655440000',
      result: InspectionResult.FAIL,
      failureReason: '  Brake issue  ',
    });
    expect(valid.failureReason).toBe('Brake issue');
    expect(await validate(valid)).toHaveLength(0);

    const invalid = plainToInstance(RecordApplicationInspectionResultDto, {
      actualStationId: 'not-a-uuid',
      result: InspectionResult.PASS,
      failureReason: 'must be absent for PASS',
    });
    expect(await validate(invalid)).not.toHaveLength(0);
  });
});
