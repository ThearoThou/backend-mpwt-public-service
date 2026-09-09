import { VehiclePlateCategory } from '../src/vehicles/enums/vehicle-plate-category.enum';
import { VehicleClass } from '../src/vehicles/enums/vehicle-class.enum';

export const LOCAL_DEMO_DATASET = 'LOCAL_DEMO_V2';

export interface LocalDemoVehicleFixture {
  slot: number;
  legacyRegistrationNumber: string;
  registrationNumber: string;
  plateCategory: VehiclePlateCategory;
  plateProvince: string;
  plateNumber: string;
  plateType: string;
  vehicleType: string;
  vehicleClass: VehicleClass;
  chassisNumber: string;
  firstRegistrationDate: string;
  make: string;
  model: string;
  manufactureYear: number;
  expiryOffsetDays: number;
  history: 'TWO_PASS' | 'ONE_PASS' | 'PASS_FAIL_PASS';
}

export const LOCAL_DEMO_VEHICLES: readonly LocalDemoVehicleFixture[] = [
  {
    slot: 1,
    legacyRegistrationNumber: 'REG-PP-2021-1047',
    registrationNumber: 'REG-PP-2023-1101',
    plateCategory: VehiclePlateCategory.PROVINCE,
    plateProvince: 'ភ្នំពេញ',
    plateNumber: '1AA-1101',
    plateType: 'PRIVATE',
    vehicleType: 'FAMILY_CAR',
    vehicleClass: VehicleClass.LIGHT,
    chassisNumber: 'LDMOLIGHT20231101A',
    firstRegistrationDate: '2023-05-18',
    make: 'Toyota',
    model: 'Corolla Cross',
    manufactureYear: 2023,
    expiryOffsetDays: 90,
    history: 'TWO_PASS',
  },
  {
    slot: 2,
    legacyRegistrationNumber: 'REG-KD-2022-2158',
    registrationNumber: 'REG-KD-2023-2202',
    plateCategory: VehiclePlateCategory.PROVINCE,
    plateProvince: 'កណ្ដាល',
    plateNumber: '1AB-2202',
    plateType: 'PRIVATE',
    vehicleType: 'FAMILY_CAR',
    vehicleClass: VehicleClass.LIGHT,
    chassisNumber: 'LDMOLIGHT20232202B',
    firstRegistrationDate: '2023-04-22',
    make: 'Honda',
    model: 'HR-V',
    manufactureYear: 2023,
    expiryOffsetDays: 45,
    history: 'TWO_PASS',
  },
  {
    slot: 3,
    legacyRegistrationNumber: 'REG-SR-2024-3269',
    registrationNumber: 'REG-SR-2024-3303',
    plateCategory: VehiclePlateCategory.PROVINCE,
    plateProvince: 'សៀមរាប',
    plateNumber: '1AC-3303',
    plateType: 'PRIVATE',
    vehicleType: 'VAN',
    vehicleClass: VehicleClass.LIGHT,
    chassisNumber: 'LDMOLIGHT20243303C',
    firstRegistrationDate: '2024-03-14',
    make: 'Kia',
    model: 'Seltos',
    manufactureYear: 2024,
    expiryOffsetDays: 30,
    history: 'ONE_PASS',
  },
  {
    slot: 4,
    legacyRegistrationNumber: 'REG-BB-2022-4380',
    registrationNumber: 'REG-BB-2022-4404',
    plateCategory: VehiclePlateCategory.PROVINCE,
    plateProvince: 'បាត់ដំបង',
    plateNumber: '1AD-4404',
    plateType: 'PRIVATE',
    vehicleType: 'SUV',
    vehicleClass: VehicleClass.LIGHT,
    chassisNumber: 'LDMOLIGHT20224404D',
    firstRegistrationDate: '2022-06-09',
    make: 'Lexus',
    model: 'NX 250',
    manufactureYear: 2022,
    expiryOffsetDays: 15,
    history: 'PASS_FAIL_PASS',
  },
  {
    slot: 5,
    legacyRegistrationNumber: 'REG-KC-2021-5491',
    registrationNumber: 'REG-KC-2021-5505',
    plateCategory: VehiclePlateCategory.PROVINCE,
    plateProvince: 'កំពង់ចាម',
    plateNumber: '1AE-5505',
    plateType: 'PRIVATE',
    vehicleType: 'SUV',
    vehicleClass: VehicleClass.LIGHT,
    chassisNumber: 'LDMOLIGHT20215505E',
    firstRegistrationDate: '2021-09-17',
    make: 'Hyundai',
    model: 'Santa Fe',
    manufactureYear: 2021,
    expiryOffsetDays: 0,
    history: 'ONE_PASS',
  },
  {
    slot: 6,
    legacyRegistrationNumber: 'REG-TK-2022-6502',
    registrationNumber: 'REG-TK-2022-6606',
    plateCategory: VehiclePlateCategory.PROVINCE,
    plateProvince: 'តាកែវ',
    plateNumber: '1AF-6606',
    plateType: 'PRIVATE',
    vehicleType: 'PICKUP',
    vehicleClass: VehicleClass.LIGHT,
    chassisNumber: 'LDMOLIGHT20226606F',
    firstRegistrationDate: '2022-08-25',
    make: 'Isuzu',
    model: 'Triton',
    manufactureYear: 2022,
    expiryOffsetDays: -15,
    history: 'PASS_FAIL_PASS',
  },
  {
    slot: 7,
    legacyRegistrationNumber: 'REG-PP-2020-7613',
    registrationNumber: 'REG-PP-2020-7707',
    plateCategory: VehiclePlateCategory.PROVINCE,
    plateProvince: 'ភ្នំពេញ',
    plateNumber: '1AG-7707',
    plateType: 'PRIVATE',
    vehicleType: 'PICKUP',
    vehicleClass: VehicleClass.LIGHT,
    chassisNumber: 'LDMOLIGHT20207707G',
    firstRegistrationDate: '2020-11-11',
    make: 'Ford',
    model: 'Everest',
    manufactureYear: 2020,
    expiryOffsetDays: -30,
    history: 'TWO_PASS',
  },
  {
    slot: 8,
    legacyRegistrationNumber: 'REG-KD-2021-8724',
    registrationNumber: 'REG-KD-2021-8808',
    plateCategory: VehiclePlateCategory.PROVINCE,
    plateProvince: 'កណ្ដាល',
    plateNumber: '1AH-8808',
    plateType: 'PRIVATE',
    vehicleClass: VehicleClass.LIGHT,
    vehicleType: 'PICKUP',
    chassisNumber: 'LDMOLIGHT20218808H',
    firstRegistrationDate: '2021-07-30',
    make: 'Toyota',
    model: 'Fortuner',
    manufactureYear: 2021,
    expiryOffsetDays: -31,
    history: 'TWO_PASS',
  },
  {
    slot: 9,
    legacyRegistrationNumber: 'REG-PP-2021-9835',
    registrationNumber: 'REG-PP-2021-9909',
    plateCategory: VehiclePlateCategory.PROVINCE,
    plateProvince: 'ភ្នំពេញ',
    plateNumber: '1AJ-9909',
    plateType: 'PRIVATE',
    vehicleType: 'SUV',
    vehicleClass: VehicleClass.LIGHT,
    chassisNumber: 'LDMOLIGHT20219909I',
    firstRegistrationDate: '2021-10-06',
    make: 'Mazda',
    model: 'CX-5',
    manufactureYear: 2021,
    expiryOffsetDays: -36,
    history: 'PASS_FAIL_PASS',
  },
  {
    slot: 10,
    legacyRegistrationNumber: 'DEV-S0-REG-010',
    registrationNumber: 'REG-PP-2021-1010',
    plateCategory: VehiclePlateCategory.PROVINCE,
    plateProvince: 'ភ្នំពេញ',
    plateNumber: '5AK-1010',
    plateType: 'COMMERCIAL',
    vehicleType: 'TRUCK',
    vehicleClass: VehicleClass.HEAVY,
    chassisNumber: 'LDMOHEAVY20211010J',
    firstRegistrationDate: '2021-10-06',
    make: 'Hino',
    model: '300',
    manufactureYear: 2021,
    expiryOffsetDays: -36,
    history: 'PASS_FAIL_PASS',
  },
];

export const LEGACY_LOCAL_DEMO_REGISTRATIONS = LOCAL_DEMO_VEHICLES.map(
  ({ legacyRegistrationNumber }) => legacyRegistrationNumber,
);

export const LOCAL_DEMO_REGISTRATIONS = LOCAL_DEMO_VEHICLES.map(
  ({ registrationNumber }) => registrationNumber,
);
