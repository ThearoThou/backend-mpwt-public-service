import type { Vehicle } from '../vehicles/entities/vehicle.entity';

export const OPTIONAL_OVERSIZE_SERVICE_FEE_KHR = '7000.00';
export const FAMILY_INSPECTION_CATEGORY_CODES = [
  'MPWT0011524',
  'MPWT0011525',
  'MPWT0011526',
] as const;

export function isOptionalOversizeServiceEligible(
  vehicle: Pick<Vehicle, 'maximumGrossWeightKg'>,
  categoryCode: string,
): boolean {
  return (
    FAMILY_INSPECTION_CATEGORY_CODES.includes(
      categoryCode as (typeof FAMILY_INSPECTION_CATEGORY_CODES)[number],
    ) && (vehicle.maximumGrossWeightKg ?? 0) > 3500
  );
}
