import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import {
  CreateVehicleRequestDto,
  ListCitizenVehiclesQueryDto,
  UpdateVehicleTechnicalDataRequestDto,
} from './vehicle-request.dtos';

describe('ListCitizenVehiclesQueryDto', () => {
  it.each([
    'createdAt',
    'registrationNumber',
    'plateNumber',
    'inspectionExpiryDate',
    'updatedAt',
  ])('accepts the approved %s sort field', async (sortBy) => {
    const input = plainToInstance(ListCitizenVehiclesQueryDto, { sortBy });

    expect(await validate(input)).toHaveLength(0);
  });

  it('rejects an unapproved sort field', async () => {
    const input = plainToInstance(ListCitizenVehiclesQueryDto, {
      sortBy: 'linkedCitizenId; DROP TABLE vehicles',
    });

    expect(await validate(input)).not.toHaveLength(0);
  });
});

describe('UpdateVehicleTechnicalDataRequestDto', () => {
  it('normalizes the supported strings and accepts decimal engine power', async () => {
    const input = plainToInstance(UpdateVehicleTechnicalDataRequestDto, {
      colour: '  White  ',
      engineNumber: ' eng  123 ',
      enginePowerHp: ' 177.50 ',
      fuelType: ' Diesel ',
      steering: ' Left ',
      wheelSize: ' 215/60R17 ',
    });

    expect(await validate(input)).toHaveLength(0);
    expect(input).toMatchObject({
      colour: 'White',
      engineNumber: 'ENG 123',
      enginePowerHp: '177.50',
      fuelType: 'Diesel',
      steering: 'Left',
      wheelSize: '215/60R17',
    });
  });

  it('allows explicit nulls and omitted fields for partial legacy-safe updates', async () => {
    const input = plainToInstance(UpdateVehicleTechnicalDataRequestDto, {
      colour: null,
      enginePowerHp: null,
      maximumLoadKg: null,
    });

    expect(await validate(input)).toHaveLength(0);
    expect(input.engineNumber).toBeUndefined();
  });

  it.each([
    ['colour', '   '],
    ['engineNumber', '   '],
    ['fuelType', '   '],
    ['steering', '   '],
    ['wheelSize', '   '],
  ])('rejects an empty normalized %s', async (field, value) => {
    const input = plainToInstance(UpdateVehicleTechnicalDataRequestDto, {
      [field]: value,
    });

    expect(await validate(input)).not.toHaveLength(0);
  });

  it.each([
    ['numberOfCylinders', 0],
    ['engineDisplacementCc', -1],
    ['numberOfSeats', 0],
    ['numberOfAxles', 0],
    ['vehicleWeightKg', 0],
    ['maximumLoadKg', -1],
    ['maximumGrossWeightKg', 0],
    ['lengthMm', 0],
    ['widthMm', -1],
    ['heightMm', 0],
  ])('rejects an out-of-contract %s', async (field, value) => {
    const input = plainToInstance(UpdateVehicleTechnicalDataRequestDto, {
      [field]: value,
    });

    expect(await validate(input)).not.toHaveLength(0);
  });

  it.each(['0', '0.00', '-1', '1.234', '1000000'])(
    'rejects invalid engine power %s',
    async (enginePowerHp) => {
      const input = plainToInstance(UpdateVehicleTechnicalDataRequestDto, {
        enginePowerHp,
      });

      expect(await validate(input)).not.toHaveLength(0);
    },
  );

  it('keeps technical fields out of the citizen create contract', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    await expect(
      pipe.transform(
        {
          colour: 'White',
        },
        { type: 'body', metatype: CreateVehicleRequestDto },
      ),
    ).rejects.toThrow();
  });
});
