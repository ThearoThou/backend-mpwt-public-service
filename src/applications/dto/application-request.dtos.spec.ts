import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateRenewalApplicationDraftRequestDto } from './application-request.dtos';

describe('CreateRenewalApplicationDraftRequestDto', () => {
  it('accepts a UUID vehicle ID', async () => {
    const input = plainToInstance(CreateRenewalApplicationDraftRequestDto, {
      vehicleId: '11111111-1111-4111-8111-111111111111',
    });

    expect(await validate(input)).toHaveLength(0);
  });

  it.each([
    ['an invalid UUID', 'invalid'],
    ['a missing vehicle ID', undefined],
  ])('rejects %s', async (_scenario, vehicleId) => {
    const input = plainToInstance(CreateRenewalApplicationDraftRequestDto, {
      vehicleId,
    });

    expect(await validate(input)).not.toHaveLength(0);
  });

  it('rejects unknown request fields with the configured whitelist behavior', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    await expect(
      pipe.transform(
        {
          vehicleId: '11111111-1111-4111-8111-111111111111',
          citizenId: '22222222-2222-4222-822222222222',
        },
        { type: 'body', metatype: CreateRenewalApplicationDraftRequestDto },
      ),
    ).rejects.toBeDefined();
  });
});
