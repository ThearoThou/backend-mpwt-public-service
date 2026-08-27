import { VehiclePlateCategory } from '../src/vehicles/enums/vehicle-plate-category.enum';
import { VehicleClass } from '../src/vehicles/enums/vehicle-class.enum';

export const LOCAL_DEMO_DATASET = 'LOCAL_DEMO_V1';

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
    legacyRegistrationNumber: 'DEV-S0-REG-001',
    registrationNumber: 'REG-PP-2021-1047',
    plateCategory: VehiclePlateCategory.PROVINCE,
    plateProvince: 'ភ្នំពេញ',
    plateNumber: '3AA-1047',
    plateType: 'PRIVATE',
    vehicleType: 'FAMILY_CAR',
    vehicleClass: VehicleClass.LIGHT,
    chassisNumber: 'XK0PR2100A0012345',
    firstRegistrationDate: '2021-05-18',
    make: 'Toyota',
    model: 'Prius',
    manufactureYear: 2021,
    expiryOffsetDays: 90,
    history: 'TWO_PASS',
  },
  {
    slot: 2,
    legacyRegistrationNumber: 'DEV-S0-REG-002',
    registrationNumber: 'REG-KD-2022-2158',
    plateCategory: VehiclePlateCategory.PROVINCE,
    plateProvince: 'កណ្ដាល',
    plateNumber: '3AB-2158',
    plateType: 'PRIVATE',
    vehicleType: 'FAMILY_CAR',
    vehicleClass: VehicleClass.LIGHT,
    chassisNumber: 'XK0PR2200A0023456',
    firstRegistrationDate: '2022-04-22',
    make: 'Honda',
    model: 'Civic',
    manufactureYear: 2022,
    expiryOffsetDays: 60,
    history: 'TWO_PASS',
  },
  {
    slot: 3,
    legacyRegistrationNumber: 'DEV-S0-REG-003',
    registrationNumber: 'REG-SR-2024-3269',
    plateCategory: VehiclePlateCategory.PROVINCE,
    plateProvince: 'សៀមរាប',
    plateNumber: '3AC-3269',
    plateType: 'PRIVATE',
    vehicleType: 'VAN',
    vehicleClass: VehicleClass.LIGHT,
    chassisNumber: 'XK0VN2400A0034567',
    firstRegistrationDate: '2024-03-14',
    make: 'Kia',
    model: 'Carnival',
    manufactureYear: 2024,
    expiryOffsetDays: 30,
    history: 'ONE_PASS',
  },
  {
    slot: 4,
    legacyRegistrationNumber: 'DEV-S0-REG-004',
    registrationNumber: 'REG-BB-2022-4380',
    plateCategory: VehiclePlateCategory.PROVINCE,
    plateProvince: 'បាត់ដំបង',
    plateNumber: '3AD-4380',
    plateType: 'PRIVATE',
    vehicleType: 'SUV',
    vehicleClass: VehicleClass.LIGHT,
    chassisNumber: 'XK0SU2200A0045678',
    firstRegistrationDate: '2022-06-09',
    make: 'Lexus',
    model: 'RX 350',
    manufactureYear: 2022,
    expiryOffsetDays: 15,
    history: 'PASS_FAIL_PASS',
  },
  {
    slot: 5,
    legacyRegistrationNumber: 'DEV-S0-REG-005',
    registrationNumber: 'REG-KC-2021-5491',
    plateCategory: VehiclePlateCategory.PROVINCE,
    plateProvince: 'កំពង់ចាម',
    plateNumber: '3AE-5491',
    plateType: 'PRIVATE',
    vehicleType: 'SUV',
    vehicleClass: VehicleClass.LIGHT,
    chassisNumber: 'XK0SU2100A0056789',
    firstRegistrationDate: '2021-09-17',
    make: 'Hyundai',
    model: 'Tucson',
    manufactureYear: 2021,
    expiryOffsetDays: 0,
    history: 'ONE_PASS',
  },
  {
    slot: 6,
    legacyRegistrationNumber: 'DEV-S0-REG-006',
    registrationNumber: 'REG-TK-2022-6502',
    plateCategory: VehiclePlateCategory.PROVINCE,
    plateProvince: 'តាកែវ',
    plateNumber: '3AF-6502',
    plateType: 'PRIVATE',
    vehicleType: 'PICKUP',
    vehicleClass: VehicleClass.LIGHT,
    chassisNumber: 'XK0PU2200A0067890',
    firstRegistrationDate: '2022-08-25',
    make: 'Isuzu',
    model: 'D-Max',
    manufactureYear: 2022,
    expiryOffsetDays: -15,
    history: 'PASS_FAIL_PASS',
  },
  {
    slot: 7,
    legacyRegistrationNumber: 'DEV-S0-REG-007',
    registrationNumber: 'REG-PP-2020-7613',
    plateCategory: VehiclePlateCategory.PROVINCE,
    plateProvince: 'ភ្នំពេញ',
    plateNumber: '3AG-7613',
    plateType: 'PRIVATE',
    vehicleType: 'PICKUP',
    vehicleClass: VehicleClass.LIGHT,
    chassisNumber: 'XK0PU2000A0078901',
    firstRegistrationDate: '2020-11-11',
    make: 'Ford',
    model: 'Ranger',
    manufactureYear: 2020,
    expiryOffsetDays: -31,
    history: 'TWO_PASS',
  },
  {
    slot: 8,
    legacyRegistrationNumber: 'DEV-S0-REG-008',
    registrationNumber: 'REG-KD-2021-8724',
    plateCategory: VehiclePlateCategory.PROVINCE,
    plateProvince: 'កណ្ដាល',
    plateNumber: '3AH-8724',
    plateType: 'PRIVATE',
    vehicleClass: VehicleClass.LIGHT,
    vehicleType: 'PICKUP',
    chassisNumber: 'XK0PU2100A0089012',
    firstRegistrationDate: '2021-07-30',
    make: 'Toyota',
    model: 'Hilux',
    manufactureYear: 2021,
    expiryOffsetDays: -45,
    history: 'ONE_PASS',
  },
  {
    slot: 9,
    legacyRegistrationNumber: 'DEV-S0-REG-009',
    registrationNumber: 'REG-PP-2021-9835',
    plateCategory: VehiclePlateCategory.PROVINCE,
    plateProvince: 'ភ្នំពេញ',
    plateNumber: '3AJ-9835',
    plateType: 'COMMERCIAL',
    vehicleType: 'TRUCK',
    vehicleClass: VehicleClass.HEAVY,
    chassisNumber: 'XK0TR2100A0090123',
    firstRegistrationDate: '2021-10-06',
    make: 'Hino',
    model: '300',
    manufactureYear: 2021,
    expiryOffsetDays: -31,
    history: 'PASS_FAIL_PASS',
  },
];

export const LEGACY_LOCAL_DEMO_REGISTRATIONS = LOCAL_DEMO_VEHICLES.map(
  ({ legacyRegistrationNumber }) => legacyRegistrationNumber,
);

export const LOCAL_DEMO_REGISTRATIONS = LOCAL_DEMO_VEHICLES.map(
  ({ registrationNumber }) => registrationNumber,
);
