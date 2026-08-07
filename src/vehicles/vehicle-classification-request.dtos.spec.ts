import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ClassifyVehicleRequestDto } from './dto/vehicle-request.dtos';

describe('ClassifyVehicleRequestDto', () => {
  it('accepts a valid UUID and trims a nonblank reason', async () => {
    const input = plainToInstance(ClassifyVehicleRequestDto, {
      inspectionCategoryId: '11111111-1111-4111-8111-111111111111',
      reason: ' Corrected after record review ',
    });

    expect(await validate(input)).toHaveLength(0);
    expect(input.reason).toBe('Corrected after record review');
  });

  it.each([
    ['an invalid UUID', 'not-a-uuid', 'Valid reason'],
    ['a missing reason', '11111111-1111-4111-8111-111111111111', undefined],
    ['a whitespace-only reason', '11111111-1111-4111-8111-111111111111', '   '],
  ])('rejects %s', async (_scenario, inspectionCategoryId, reason) => {
    const input = plainToInstance(ClassifyVehicleRequestDto, {
      inspectionCategoryId,
      reason,
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
          inspectionCategoryId: '11111111-1111-4111-8111-111111111111',
          reason: 'Valid reason',
          changedByAdminId: '22222222-2222-4222-8222-222222222222',
        },
        { type: 'body', metatype: ClassifyVehicleRequestDto },
      ),
    ).rejects.toBeDefined();
  });
});
