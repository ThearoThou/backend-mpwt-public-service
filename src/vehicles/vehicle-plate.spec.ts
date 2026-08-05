import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import {
  CAMBODIAN_CAPITAL_PROVINCES_KH,
  CAMBODIAN_PLATE_DISPLAY_LABEL_KH,
} from './cambodian-capital-provinces';
import { CreateVehicleRequestDto } from './dto/vehicle-request.dtos';
import { VehiclePlateCategory } from './enums/vehicle-plate-category.enum';
import { mapVehicle } from './vehicle-response.mapper';

describe('Cambodian civilian vehicle plates', () => {
  it('exposes exactly 25 unique canonical Khmer capital/province labels', () => {
    expect(CAMBODIAN_CAPITAL_PROVINCES_KH).toHaveLength(25);
    expect(new Set(CAMBODIAN_CAPITAL_PROVINCES_KH).size).toBe(25);
    expect(CAMBODIAN_CAPITAL_PROVINCES_KH).toEqual(
      expect.arrayContaining(['ភ្នំពេញ', 'កណ្ដាល', 'រតនគិរី', 'ឧត្តរមានជ័យ']),
    );
  });

  it('accepts every approved Khmer province and trims it canonically', async () => {
    for (const plateProvince of CAMBODIAN_CAPITAL_PROVINCES_KH) {
      const input = dto({ plateProvince: ` ${plateProvince} ` });

      expect(await validate(input)).toHaveLength(0);
      expect(input.plateProvince).toBe(plateProvince);
    }
  });

  it.each(['Phnom Penh', 'Siem Reap', 'កម្ពុជា', 'ខេត្តមិនគាំទ្រ', '   '])(
    'rejects %s as a province label',
    async (plateProvince) => {
      expect(await errors({ plateProvince })).toContain('plateNumber');
    },
  );

  it.each([
    ['2A-3146', '2A-3146'],
    ['2AB-3146', '2AB-3146'],
    [' 2ab-3146 ', '2AB-3146'],
  ])('accepts province plate %s as %s', async (plateNumber, expected) => {
    const input = dto({ plateNumber });

    expect(await validate(input)).toHaveLength(0);
    expect(input.plateNumber).toBe(expected);
  });

  it.each([
    '2A3146',
    '2A 3146',
    'AB-3146',
    '22A-3146',
    '2ABC-3146',
    '2A-314',
    '2A-31467',
    '2ក-3146',
    '',
  ])('rejects malformed province plate %s', async (plateNumber) => {
    expect(await errors({ plateNumber })).toContain('plateNumber');
  });

  it.each([
    ['A', 'A'],
    ['12345678', '12345678'],
    ['SEHORNG', 'SEHORNG'],
    ['CHHAY.69', 'CHHAY.69'],
    ['SINA.007', 'SINA.007'],
    [' tq.aa.a1 ', 'TQ.AA.A1'],
    ['A......1', 'A......1'],
  ])('accepts personalized plate %s as %s', async (plateNumber, expected) => {
    const input = dto({
      plateCategory: VehiclePlateCategory.PERSONALIZED_CAMBODIA,
      plateProvince: null,
      plateNumber,
    });

    expect(await validate(input)).toHaveLength(0);
    expect(input.plateNumber).toBe(expected);
  });

  it('allows an omitted province for a personalized plate and derives Cambodia', async () => {
    const input = dto({
      plateCategory: VehiclePlateCategory.PERSONALIZED_CAMBODIA,
      plateProvince: undefined,
      plateNumber: 'TQ.AA.A1',
    });

    expect(await validate(input)).toHaveLength(0);
    expect(
      mapVehicle({
        ...vehicle(),
        plateCategory: VehiclePlateCategory.PERSONALIZED_CAMBODIA,
        plateProvince: null,
        plateNumber: 'TQ.AA.A1',
      }),
    ).toMatchObject({
      plateProvince: null,
      plateDisplayLabelKh: CAMBODIAN_PLATE_DISPLAY_LABEL_KH,
    });
  });

  it.each([
    'MORETHAN8',
    'SOK DARA',
    'SOK-DARA',
    'សុខ',
    '@ABC',
    'ABC/123',
    '........',
  ])('rejects malformed personalized plate %s', async (plateNumber) => {
    expect(
      await errors({
        plateCategory: VehiclePlateCategory.PERSONALIZED_CAMBODIA,
        plateProvince: null,
        plateNumber,
      }),
    ).toContain('plateNumber');
  });

  it('rejects a non-null province for a personalized plate', async () => {
    expect(
      await errors({
        plateCategory: VehiclePlateCategory.PERSONALIZED_CAMBODIA,
        plateProvince: 'ភ្នំពេញ',
      }),
    ).toContain('plateNumber');
  });
});

function dto(overrides: Partial<CreateVehicleRequestDto> = {}) {
  return plainToInstance(CreateVehicleRequestDto, {
    registrationNumber: 'AB-1234',
    plateCategory: VehiclePlateCategory.PROVINCE,
    plateProvince: 'ភ្នំពេញ',
    plateNumber: '2AB-3146',
    plateType: 'Private',
    vehicleType: 'Car',
    make: 'Toyota',
    model: 'Camry',
    chassisNumber: 'CH-123',
    firstRegistrationDate: '2020-01-01',
    inspectionExpiryDate: '2030-01-01',
    registeredOwnerNameKh: 'ម្ចាស់យានយន្ត',
    registeredOwnerNameEn: 'Citizen Owner',
    registeredOwnerPhone: '+85512345678',
    ...overrides,
  });
}

async function errors(overrides: Partial<CreateVehicleRequestDto>) {
  return (await validate(dto(overrides))).map((error) => error.property);
}

function vehicle() {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    linkedCitizenId: '11111111-1111-4111-8111-111111111111',
    registrationNumber: 'AB-1234',
    plateNumber: '2AB-3146',
    plateCategory: VehiclePlateCategory.PROVINCE,
    plateProvince: 'ភ្នំពេញ',
    plateType: 'Private',
    vehicleType: 'Car',
    make: 'Toyota',
    model: 'Camry',
    manufactureYear: 2020,
    chassisNumber: 'CH-123',
    firstRegistrationDate: '2020-01-01',
    lastInspectionDate: null,
    inspectionExpiryDate: '2030-01-01',
    registeredOwnerNameKh: 'ម្ចាស់យានយន្ត',
    registeredOwnerNameEn: 'Citizen Owner',
    registeredOwnerPhone: '+85512345678',
    isActive: true,
    createdAt: new Date('2030-01-01T00:00:00.000Z'),
    updatedAt: new Date('2030-01-01T00:00:00.000Z'),
    linkedCitizen: null,
    renewalApplications: [],
  };
}
