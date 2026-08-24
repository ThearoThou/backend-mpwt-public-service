import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import {
  CreateVehicleRequestDto,
  ListAdminVehiclesQueryDto,
  ListCitizenVehiclesQueryDto,
} from './dto/vehicle-request.dtos';
import { CAMBODIAN_CAPITAL_PROVINCES_KH } from './cambodian-capital-provinces';
import {
  VehicleNormalizationError,
  normalizeVehicleIdentifier,
  trimRequiredVehicleText,
} from './vehicle-normalization';
import { VehiclePlateCategory } from './enums/vehicle-plate-category.enum';

describe('vehicle normalization', () => {
  it('trims, uppercases Latin letters, collapses whitespace, and preserves punctuation', () => {
    expect(normalizeVehicleIdentifier(' ab-1234 ')).toBe('AB-1234');
    expect(normalizeVehicleIdentifier('1a  \t2345')).toBe('1A 2345');
    expect(normalizeVehicleIdentifier(' ab/12-34.5 ')).toBe('AB/12-34.5');
  });

  it('rejects blank normalized identifiers and descriptive values', () => {
    expect(() => normalizeVehicleIdentifier(' \t ')).toThrow(
      VehicleNormalizationError,
    );
    expect(() => trimRequiredVehicleText(' ', 'Make')).toThrow(
      VehicleNormalizationError,
    );
  });

  it('uses the existing Cambodian phone normalization through the create DTO', async () => {
    const input = plainToInstance(
      CreateVehicleRequestDto,
      validInput({
        registrationNumber: ' ab-1234 ',
        chassisNumber: ' ch  123 ',
        plateNumber: ' 2ab-3146 ',
        registeredOwnerPhone: '012 345 678',
      }),
    );

    expect(await validate(input)).toHaveLength(0);
    expect(input.registrationNumber).toBe('AB-1234');
    expect(input.chassisNumber).toBe('CH 123');
    expect(input.plateNumber).toBe('2AB-3146');
    expect(input.registeredOwnerPhone).toBe('+85512345678');
  });

  it('rejects blank canonical values, invalid phones, and non-date-only values', async () => {
    const input = plainToInstance(
      CreateVehicleRequestDto,
      validInput({
        registrationNumber: '   ',
        registeredOwnerPhone: '85512345678',
        firstRegistrationDate: '2030-08-01T00:00:00.000Z',
      }),
    );

    const errors = await validate(input);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining([
        'registrationNumber',
        'registeredOwnerPhone',
        'firstRegistrationDate',
      ]),
    );
  });

  it('accepts real calendar dates including leap days', async () => {
    const create = plainToInstance(
      CreateVehicleRequestDto,
      validInput({
        firstRegistrationDate: '2024-02-29',
        lastInspectionDate: '2026-08-04',
        inspectionExpiryDate: '2028-02-29',
      }),
    );
    const query = plainToInstance(ListAdminVehiclesQueryDto, {
      createdFrom: '2024-02-29',
      createdTo: '2026-08-04',
    });
    const citizenQuery = plainToInstance(ListCitizenVehiclesQueryDto, {
      firstRegistrationDate: '2024-02-29',
    });

    expect(await validate(create)).toHaveLength(0);
    expect(await validate(query)).toHaveLength(0);
    expect(await validate(citizenQuery)).toHaveLength(0);
  });

  it.each(['2026-02-30', '2025-13-01', '2025-00-10', '2026-08-04T00:00:00Z'])(
    'rejects %s as a vehicle calendar date',
    async (value) => {
      const create = plainToInstance(
        CreateVehicleRequestDto,
        validInput({
          firstRegistrationDate: value,
          lastInspectionDate: value,
          inspectionExpiryDate: value,
        }),
      );
      const query = plainToInstance(ListAdminVehiclesQueryDto, {
        createdFrom: value,
        createdTo: value,
      });
      const citizenQuery = plainToInstance(ListCitizenVehiclesQueryDto, {
        firstRegistrationDate: value,
      });

      expect((await validate(create)).map((error) => error.property)).toEqual(
        expect.arrayContaining([
          'firstRegistrationDate',
          'lastInspectionDate',
          'inspectionExpiryDate',
        ]),
      );
      expect((await validate(query)).map((error) => error.property)).toEqual(
        expect.arrayContaining(['createdFrom', 'createdTo']),
      );
      expect(
        (await validate(citizenQuery)).map((error) => error.property),
      ).toContain('firstRegistrationDate');
    },
  );

  it.each(['2020', true, 2020.5])(
    'rejects a non-integer manufacture year of %p',
    async (manufactureYear) => {
      const input = plainToInstance(
        CreateVehicleRequestDto,
        validInput({ manufactureYear } as Partial<CreateVehicleRequestDto>),
      );

      expect((await validate(input)).map((error) => error.property)).toContain(
        'manufactureYear',
      );
    },
  );

  it('accepts an actual JSON integer manufacture year without coercion', async () => {
    const input = plainToInstance(
      CreateVehicleRequestDto,
      validInput({ manufactureYear: 2020 }),
    );

    expect(await validate(input)).toHaveLength(0);
    expect(input.manufactureYear).toBe(2020);
  });

  it('validates and normalizes complete citizen plate lookup identities', async () => {
    const unfiltered = plainToInstance(ListCitizenVehiclesQueryDto, {});
    const province = CAMBODIAN_CAPITAL_PROVINCES_KH[0];
    const provincial = plainToInstance(ListCitizenVehiclesQueryDto, {
      plateCategory: VehiclePlateCategory.PROVINCE,
      plateProvince: ` ${province} `,
      plateNumber: ' 2ab-3146 ',
    });
    const personalized = plainToInstance(ListCitizenVehiclesQueryDto, {
      plateCategory: VehiclePlateCategory.PERSONALIZED_CAMBODIA,
      plateNumber: ' tq.aa.a1 ',
    });

    expect(await validate(unfiltered)).toHaveLength(0);
    expect(await validate(provincial)).toHaveLength(0);
    expect(provincial.plateProvince).toBe(province);
    expect(provincial.plateNumber).toBe('2AB-3146');
    expect(await validate(personalized)).toHaveLength(0);
    expect(personalized.plateNumber).toBe('TQ.AA.A1');
  });

  it('rejects incomplete or invalid citizen plate lookup identities', async () => {
    const incomplete = plainToInstance(ListCitizenVehiclesQueryDto, {
      plateNumber: '2AB-3146',
    });
    const invalidProvince = plainToInstance(ListCitizenVehiclesQueryDto, {
      plateCategory: VehiclePlateCategory.PROVINCE,
      plateProvince: 'Unknown',
      plateNumber: '2AB-3146',
    });

    expect(
      (await validate(incomplete)).map((error) => error.property),
    ).toContain('plateCategory');
    expect(
      (await validate(invalidProvince)).map((error) => error.property),
    ).toContain('plateCategory');
  });
});

function validInput(overrides: Partial<CreateVehicleRequestDto> = {}) {
  return {
    registrationNumber: 'AB-1234',
    plateNumber: '2AB-3146',
    plateCategory: VehiclePlateCategory.PROVINCE,
    plateProvince: 'ភ្នំពេញ',
    plateType: 'Private',
    vehicleType: 'Car',
    make: 'Toyota',
    model: 'Camry',
    chassisNumber: 'CH-123',
    firstRegistrationDate: '2020-01-01',
    inspectionExpiryDate: '2030-01-01',
    registeredOwnerNameKh: 'អ្នកបើកបរ',
    registeredOwnerNameEn: 'Citizen Owner',
    registeredOwnerPhone: '+85512345678',
    ...overrides,
  };
}
