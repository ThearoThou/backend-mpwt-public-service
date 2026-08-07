import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import {
  CreateInspectionCategoryRequestDto,
  UpdateInspectionCategoryRequestDto,
} from './dto/inspection-category-request.dtos';
import { VehicleClass } from '../vehicles/enums/vehicle-class.enum';

describe('inspection category request DTOs', () => {
  it('accepts valid create input and trims required text', async () => {
    const input = plainToInstance(CreateInspectionCategoryRequestDto, {
      code: ' LIGHT-PRIVATE ',
      nameKh: ' ឡានតូច ',
      vehicleClass: VehicleClass.LIGHT,
      validityMonths: '12',
      inspectionFeeKhr: '25000.00',
      serviceFeeKhr: '5000',
    });

    expect(await validate(input)).toHaveLength(0);
    expect(input.code).toBe('LIGHT-PRIVATE');
    expect(input.nameKh).toBe('ឡានតូច');
    expect(input.validityMonths).toBe(12);
  });

  it.each(['-1', '1.234', '01.00', 'abc'])(
    'rejects invalid Khmer Riel amount %s',
    async (inspectionFeeKhr) => {
      const input = plainToInstance(CreateInspectionCategoryRequestDto, {
        code: 'LIGHT-PRIVATE',
        nameKh: 'ឡានតូច',
        vehicleClass: VehicleClass.LIGHT,
        validityMonths: 12,
        inspectionFeeKhr,
        serviceFeeKhr: '0',
      });

      expect(await validate(input)).not.toHaveLength(0);
    },
  );

  it('accepts the PostgreSQL numeric(12,2) maximum for both fee fields', async () => {
    const input = plainToInstance(CreateInspectionCategoryRequestDto, {
      code: 'LIGHT-PRIVATE',
      nameKh: 'ឡានតូច',
      vehicleClass: VehicleClass.LIGHT,
      validityMonths: 12,
      inspectionFeeKhr: '9999999999.99',
      serviceFeeKhr: '9999999999.99',
    });

    expect(await validate(input)).toHaveLength(0);
  });

  it.each(['inspectionFeeKhr', 'serviceFeeKhr'] as const)(
    'rejects %s above the PostgreSQL numeric(12,2) range',
    async (feeField) => {
      for (const invalidAmount of ['10000000000', '10000000000.00']) {
        const input = plainToInstance(CreateInspectionCategoryRequestDto, {
          code: 'LIGHT-PRIVATE',
          nameKh: 'ឡានតូច',
          vehicleClass: VehicleClass.LIGHT,
          validityMonths: 12,
          inspectionFeeKhr: '0',
          serviceFeeKhr: '0',
          [feeField]: invalidAmount,
        });

        expect(await validate(input)).not.toHaveLength(0);
      }
    },
  );

  it('does not declare category identity fields as updatable', () => {
    const input = new UpdateInspectionCategoryRequestDto();

    expect(Object.prototype.hasOwnProperty.call(input, 'code')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(input, 'vehicleClass')).toBe(
      false,
    );
  });
});
