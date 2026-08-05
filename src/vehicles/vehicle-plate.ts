import { isCambodianCapitalProvinceKh } from './cambodian-capital-provinces';
import { VehiclePlateCategory } from './enums/vehicle-plate-category.enum';

const PROVINCE_PLATE_PATTERN = /^[0-9][A-Z]{1,2}-[0-9]{4}$/;
const PERSONALIZED_CAMBODIA_PLATE_PATTERN = /^(?=.*[A-Z0-9])[A-Z0-9.]{1,8}$/;

export function normalizePlateNumber(value: string): string {
  if (typeof value !== 'string') {
    return value;
  }

  return value
    .trim()
    .replace(/\p{Script=Latin}/gu, (character) => character.toUpperCase());
}

export function normalizePlateProvince(value: string): string {
  return value.trim();
}

export function isValidVehiclePlate(
  category: unknown,
  plateProvince: unknown,
  plateNumber: unknown,
): boolean {
  if (typeof plateNumber !== 'string') {
    return false;
  }

  if (category === VehiclePlateCategory.PROVINCE) {
    return (
      typeof plateProvince === 'string' &&
      isCambodianCapitalProvinceKh(plateProvince) &&
      PROVINCE_PLATE_PATTERN.test(plateNumber)
    );
  }

  return (
    category === VehiclePlateCategory.PERSONALIZED_CAMBODIA &&
    (plateProvince === undefined || plateProvince === null) &&
    PERSONALIZED_CAMBODIA_PLATE_PATTERN.test(plateNumber)
  );
}
