import { VehicleClass } from '../vehicles/enums/vehicle-class.enum';

export const ZERO_SERVICE_FEE_KHR = '0.00';

export type MpwtInspectionValidityMonths = 12 | 24 | 48;

export interface MpwtInspectionCategoryReference {
  code: string;
  nameKh: string;
  nameEn: string;
  vehicleClass: VehicleClass;
  inspectionFeeKhr: string;
  validityMonths: MpwtInspectionValidityMonths;
  serviceFeeKhr: typeof ZERO_SERVICE_FEE_KHR;
  isActive: true;
}

const category = (
  code: string,
  nameKh: string,
  nameEn: string,
  vehicleClass: VehicleClass,
  inspectionFeeKhr: string,
  validityMonths: MpwtInspectionValidityMonths,
): MpwtInspectionCategoryReference => ({
  code,
  nameKh,
  nameEn,
  vehicleClass,
  inspectionFeeKhr,
  validityMonths,
  serviceFeeKhr: ZERO_SERVICE_FEE_KHR,
  isActive: true,
});

export const MPWT_INSPECTION_CATEGORY_REFERENCE: readonly MpwtInspectionCategoryReference[] =
  [
    // These 19 approved categories and their validity values are maintained
    // from the project MPWT inspection-category Excel/reference data. The
    // original high-level validity rules were cross-checked with the MPWT
    // infographic; it does not explicitly list every detailed mapping here.
    category(
      'MPWT-TRICYCLE-MOTORCYCLE-TRAILER',
      'ត្រីក្រយានយន្ត ឬទោចក្រយានយន្តសណ្តោងរ៉ឺម៉ក',
      'Tricycle or motorcycle towing a trailer',
      VehicleClass.LIGHT,
      '7000.00',
      12,
    ),
    category(
      'MPWT0011524',
      'រថយន្តទេសចរណ៍(រថយន្តគ្រួសារ) ថ្មី (2A)',
      'New family/passenger vehicle, all types',
      VehicleClass.LIGHT,
      '36000.00',
      48,
    ),
    category(
      'MPWT0011525',
      'រថយន្តទេសចរណ៍(រថយន្តគ្រួសារ) 4ត្រឹមកៅអី (2A)',
      'Family/passenger vehicle, up to 4 seats',
      VehicleClass.LIGHT,
      '42000.00',
      24,
    ),
    category(
      'MPWT0011526',
      'រថយន្តទេសចរណ៍(រថយន្តគ្រួសារ) ពី5 ដល់ 9កៅអី (មិនធ្វើអាជីវកម្ម)',
      'Family/passenger vehicle, 5 to 9 seats, non-commercial',
      VehicleClass.LIGHT,
      '48000.00',
      24,
    ),
    category(
      'MPWT0011527',
      'រថយន្តទេសចរណ៍(តាក់ស៊ី) ពី5 ដល់ 9កៅអី',
      'Taxi/passenger vehicle, 5 to 9 seats',
      VehicleClass.LIGHT,
      '48000.00',
      12,
    ),
    category(
      'MPWT0011528',
      'រថយន្តដឹកអ្នកដំណើរ 10 ដល់ 14កៅអី (2A)',
      'Passenger vehicle, 10 to 14 seats',
      VehicleClass.LIGHT,
      '54000.00',
      12,
    ),
    category(
      'MPWT0011529',
      'រថយន្តដឹកអ្នកដំណើរ ត្រឹម 15កៅអី (2A)',
      'Passenger vehicle, 15 seats',
      VehicleClass.LIGHT,
      '57000.00',
      12,
    ),
    category(
      'MPWT0011530',
      'រថយន្តដឹកអ្នកដំណើរ 16 ដល់ 20កៅអី (3A)',
      'Passenger vehicle, 16 to 20 seats',
      VehicleClass.HEAVY,
      '60000.00',
      12,
    ),
    category(
      'MPWT0011531',
      'រថយន្តដឹកអ្នកដំណើរ 21កៅអី ឡើងទៅ (3A)',
      'Passenger vehicle, 21 seats and above',
      VehicleClass.HEAVY,
      '66000.00',
      12,
    ),
    category(
      'MPWT0011532',
      'រថយន្តដឹកទំនិញ ថ្មី ផ្ទុកមិនលើស 1តោន (2A) (មិនធ្វើអាជីវកម្ម)',
      'New goods vehicle, up to 1 tonne, non-commercial',
      VehicleClass.LIGHT,
      '36000.00',
      // Approved project mapping from the inspection-category Excel/reference
      // data; not an explicit category-code row in the MPWT infographic.
      48,
    ),
    category(
      'MPWT0011533',
      'រថយន្តដឹកទំនិញ ផ្ទុកមិនលើស 1តោន (2A) (មិនធ្វើអាជីវកម្ម)',
      'Goods vehicle, up to 1 tonne, non-commercial',
      VehicleClass.LIGHT,
      '48000.00',
      // Approved project mapping from the inspection-category Excel/reference
      // data; not an explicit category-code row in the MPWT infographic.
      24,
    ),
    category(
      'MPWT0011534',
      'រថយន្តដឹកទំនិញធុនតូច ផ្ទុកមិនលើស 1តោន (2A) (ធ្វើអាជីវកម្ម)',
      'Light goods vehicle, up to 1 tonne, commercial',
      VehicleClass.LIGHT,
      '36000.00',
      12,
    ),
    category(
      'MPWT0011535',
      'រថយន្តដឹកទំនិញ ឬអ្នកដំណើរ ថ្មី ធុនតូច (2A) (ធ្វើអាជីវកម្ម)',
      'New commercial light goods/passenger vehicle',
      VehicleClass.LIGHT,
      '30000.00',
      24,
    ),
    category(
      'MPWT0011536',
      'រថយន្តដឹកទំនិញ ឬអ្នកដំណើរ ថ្មី ធុនធំ (3A) (ធ្វើអាជីវកម្ម)',
      'New commercial heavy goods/passenger vehicle',
      VehicleClass.HEAVY,
      '33000.00',
      24,
    ),
    category(
      'MPWT0011537',
      'រថយន្តដឹកទំនិញ ផ្ទុកមិនលើស 2តោន (2A)',
      'Goods vehicle, up to 2 tonnes',
      VehicleClass.LIGHT,
      '54000.00',
      12,
    ),
    category(
      'MPWT0011538',
      'រថយន្តដឹកទំនិញ ផ្ទុកលើសពី 2តោន ដល់ 5តោន (3A)',
      'Goods vehicle, over 2 to 5 tonnes',
      VehicleClass.HEAVY,
      '57000.00',
      12,
    ),
    category(
      'MPWT0011539',
      'ក្បាលសណ្តោង ឬរថយន្តដឹកទំនិញ ផ្ទុកលើស5តោន ដល់10តោន (3A)',
      'Tractor unit or goods vehicle, over 5 to 10 tonnes',
      VehicleClass.HEAVY,
      '60000.00',
      12,
    ),
    category(
      'MPWT0011540',
      'ក្បាលសណ្តោង ឬរថយន្តដឹកទំនិញ ផ្ទុកលើស10តោន (3A)',
      'Tractor unit or goods vehicle, over 10 tonnes',
      VehicleClass.HEAVY,
      '66000.00',
      12,
    ),
    category(
      'MPWT0011541',
      'រ៉ឺម៉ក ឬសឺមីរ៉ឺម៉ករថយន្ត',
      'Trailer or semi-trailer vehicle',
      VehicleClass.HEAVY,
      '36000.00',
      // The project reference contains only this used/existing trailer row;
      // it has no separate new-trailer category row.
      12,
    ),
  ];
