import type { EntityManager } from 'typeorm';

import { upsertReferenceData } from '../../scripts/seed-mpwt-inspection-category-reference';
import { InspectionVehicleCategory } from './entities/inspection-vehicle-category.entity';
import {
  MPWT_INSPECTION_CATEGORY_REFERENCE,
  ZERO_SERVICE_FEE_KHR,
} from './mpwt-inspection-category-reference';
import { VehicleClass } from '../vehicles/enums/vehicle-class.enum';

describe('MPWT inspection category reference data', () => {
  it('contains the 19 base inspection tariff rows from the source workbook', () => {
    expect(MPWT_INSPECTION_CATEGORY_REFERENCE).toHaveLength(19);
    expect(MPWT_INSPECTION_CATEGORY_REFERENCE.map(({ code }) => code)).toEqual([
      'MPWT-TRICYCLE-MOTORCYCLE-TRAILER',
      ...Array.from(
        { length: 18 },
        (_, index) => `MPWT001${String(1524 + index)}`,
      ),
    ]);
  });

  it.each([
    [
      'MPWT-TRICYCLE-MOTORCYCLE-TRAILER',
      'ត្រីក្រយានយន្ត ឬទោចក្រយានយន្តសណ្តោងរ៉ឺម៉ក',
      '7000.00',
    ],
    ['MPWT0011524', 'រថយន្តទេសចរណ៍(រថយន្តគ្រួសារ) ថ្មី (2A)', '36000.00'],
    ['MPWT0011525', 'រថយន្តទេសចរណ៍(រថយន្តគ្រួសារ) 4ត្រឹមកៅអី (2A)', '42000.00'],
    [
      'MPWT0011526',
      'រថយន្តទេសចរណ៍(រថយន្តគ្រួសារ) ពី5 ដល់ 9កៅអី (មិនធ្វើអាជីវកម្ម)',
      '48000.00',
    ],
    ['MPWT0011527', 'រថយន្តទេសចរណ៍(តាក់ស៊ី) ពី5 ដល់ 9កៅអី', '48000.00'],
    ['MPWT0011528', 'រថយន្តដឹកអ្នកដំណើរ 10 ដល់ 14កៅអី (2A)', '54000.00'],
    ['MPWT0011529', 'រថយន្តដឹកអ្នកដំណើរ ត្រឹម 15កៅអី (2A)', '57000.00'],
    ['MPWT0011530', 'រថយន្តដឹកអ្នកដំណើរ 16 ដល់ 20កៅអី (3A)', '60000.00'],
    ['MPWT0011531', 'រថយន្តដឹកអ្នកដំណើរ 21កៅអី ឡើងទៅ (3A)', '66000.00'],
    [
      'MPWT0011532',
      'រថយន្តដឹកទំនិញ ថ្មី ផ្ទុកមិនលើស 1តោន (2A) (មិនធ្វើអាជីវកម្ម)',
      '36000.00',
    ],
    [
      'MPWT0011533',
      'រថយន្តដឹកទំនិញ ផ្ទុកមិនលើស 1តោន (2A) (មិនធ្វើអាជីវកម្ម)',
      '48000.00',
    ],
    [
      'MPWT0011534',
      'រថយន្តដឹកទំនិញធុនតូច ផ្ទុកមិនលើស 1តោន (2A) (ធ្វើអាជីវកម្ម)',
      '36000.00',
    ],
    [
      'MPWT0011535',
      'រថយន្តដឹកទំនិញ ឬអ្នកដំណើរ ថ្មី ធុនតូច (2A) (ធ្វើអាជីវកម្ម)',
      '30000.00',
    ],
    [
      'MPWT0011536',
      'រថយន្តដឹកទំនិញ ឬអ្នកដំណើរ ថ្មី ធុនធំ (3A) (ធ្វើអាជីវកម្ម)',
      '33000.00',
    ],
    ['MPWT0011537', 'រថយន្តដឹកទំនិញ ផ្ទុកមិនលើស 2តោន (2A)', '54000.00'],
    ['MPWT0011538', 'រថយន្តដឹកទំនិញ ផ្ទុកលើសពី 2តោន ដល់ 5តោន (3A)', '57000.00'],
    [
      'MPWT0011539',
      'ក្បាលសណ្តោង ឬរថយន្តដឹកទំនិញ ផ្ទុកលើស5តោន ដល់10តោន (3A)',
      '60000.00',
    ],
    [
      'MPWT0011540',
      'ក្បាលសណ្តោង ឬរថយន្តដឹកទំនិញ ផ្ទុកលើស10តោន (3A)',
      '66000.00',
    ],
    ['MPWT0011541', 'រ៉ឺម៉ក ឬសឺមីរ៉ឺម៉ករថយន្ត', '36000.00'],
  ])(
    'preserves the source Khmer wording and fee for %s',
    (code, nameKh, inspectionFeeKhr) => {
      expect(MPWT_INSPECTION_CATEGORY_REFERENCE).toContainEqual(
        expect.objectContaining({ code, nameKh, inspectionFeeKhr }),
      );
    },
  );

  it('uses the approved project-reference validity for every category row', () => {
    expect(
      MPWT_INSPECTION_CATEGORY_REFERENCE.map(
        ({ validityMonths }) => validityMonths,
      ),
    ).toEqual([
      12, 48, 24, 24, 12, 12, 12, 12, 12, 48, 24, 12, 24, 24, 12, 12, 12, 12,
      12,
    ]);
  });

  it('keeps all reference service fees at zero and all rows active', () => {
    expect(
      MPWT_INSPECTION_CATEGORY_REFERENCE.every(
        (category) =>
          category.serviceFeeKhr === ZERO_SERVICE_FEE_KHR && category.isActive,
      ),
    ).toBe(true);
  });

  it('retains the workbook 2A and 3A class distinctions in the current model', () => {
    expect(
      MPWT_INSPECTION_CATEGORY_REFERENCE.find(
        ({ code }) => code === 'MPWT0011530',
      )?.vehicleClass,
    ).toBe(VehicleClass.HEAVY);
    expect(
      MPWT_INSPECTION_CATEGORY_REFERENCE.find(
        ({ code }) => code === 'MPWT0011529',
      )?.vehicleClass,
    ).toBe(VehicleClass.LIGHT);
  });

  it('updates existing rows by stable code, preserves IDs, and is idempotent', async () => {
    const existingByCode = new Map(
      MPWT_INSPECTION_CATEGORY_REFERENCE.map((reference, index) => [
        reference.code,
        {
          ...reference,
          id: `preserved-id-${index + 1}`,
          validityMonths: 12,
        } as InspectionVehicleCategory,
      ]),
    );
    const originalIds = new Map(
      [...existingByCode].map(([code, category]) => [code, category.id]),
    );
    const originalFees = new Map(
      [...existingByCode].map(([code, category]) => [
        code,
        [category.inspectionFeeKhr, category.serviceFeeKhr],
      ]),
    );
    const repository = {
      findOneBy: jest.fn(
        ({ code }: { code: string }) => existingByCode.get(code) ?? null,
      ),
      create: jest.fn((value: InspectionVehicleCategory) => value),
      merge: jest.fn(
        (
          existing: InspectionVehicleCategory,
          value: Partial<InspectionVehicleCategory>,
        ) => Object.assign(existing, value),
      ),
      save: jest.fn((value: InspectionVehicleCategory) => {
        existingByCode.set(value.code, value);
        return value;
      }),
    };
    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        expect(entity).toBe(InspectionVehicleCategory);
        return repository;
      }),
    } as unknown as EntityManager;

    const first = await upsertReferenceData(manager);
    const second = await upsertReferenceData(manager);

    expect(first).toEqual({
      created: [],
      updated: [
        'MPWT0011524',
        'MPWT0011525',
        'MPWT0011526',
        'MPWT0011532',
        'MPWT0011533',
        'MPWT0011535',
        'MPWT0011536',
      ],
      unchanged: [
        'MPWT-TRICYCLE-MOTORCYCLE-TRAILER',
        'MPWT0011527',
        'MPWT0011528',
        'MPWT0011529',
        'MPWT0011530',
        'MPWT0011531',
        'MPWT0011534',
        'MPWT0011537',
        'MPWT0011538',
        'MPWT0011539',
        'MPWT0011540',
        'MPWT0011541',
      ],
    });
    expect(second).toEqual({
      created: [],
      updated: [],
      unchanged: MPWT_INSPECTION_CATEGORY_REFERENCE.map(({ code }) => code),
    });
    expect(existingByCode.size).toBe(19);
    expect(new Set(existingByCode.keys()).size).toBe(19);
    existingByCode.forEach((category, code) => {
      expect(category.id).toBe(originalIds.get(code));
      expect([category.inspectionFeeKhr, category.serviceFeeKhr]).toEqual(
        originalFees.get(code),
      );
    });
  });
});
