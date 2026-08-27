import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CitizenSchedulingPreferenceRequestDto } from './scheduling-request.dtos';

describe('CitizenSchedulingPreferenceRequestDto', () => {
  it('accepts a required date with no station preference', async () => {
    const errors = await validate(
      plainToInstance(CitizenSchedulingPreferenceRequestDto, {
        preferredInspectionDate: '2026-08-24',
        preferredInspectionStationId: null,
      }),
    );
    expect(errors).toHaveLength(0);
  });

  it('accepts a supplied station preference', async () => {
    const errors = await validate(
      plainToInstance(CitizenSchedulingPreferenceRequestDto, {
        preferredInspectionDate: '2026-08-24',
        preferredInspectionStationId: '11111111-1111-4111-8111-111111111111',
      }),
    );
    expect(errors).toHaveLength(0);
  });

  it.each([
    {},
    {
      preferredInspectionDate: '2026-08-24',
      preferredInspectionStationId: 'invalid',
    },
  ])('rejects an invalid preference payload', async (payload) => {
    const errors = await validate(
      plainToInstance(CitizenSchedulingPreferenceRequestDto, payload),
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});
