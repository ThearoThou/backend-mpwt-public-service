import { ApplicationStatus } from '../src/applications/enums/application-status.enum';

export type FamilyCategoryCode = 'MPWT0011524' | 'MPWT0011525' | 'MPWT0011526';
type ExpiryOffsetDays =
  -90 | -60 | -50 | -45 | -40 | -25 | -15 | -10 | 15 | 180;
export type WorkflowScenario =
  | 'DRAFT'
  | 'PRIMARY_FAIL_TERMINAL'
  | 'WAITING_PAYMENT_CONFIRMATION'
  | 'READY_FOR_PHYSICAL_INSPECTION'
  | 'PASS_WAITING_STICKER'
  | 'DOCUMENTS_UNDER_REVIEW'
  | 'DOCUMENTS_APPROVED_WAITING_CERTIFICATE'
  | 'CORRECTION_REQUIRED'
  | 'CORRECTION_REPLACED_PENDING'
  | 'REJECTED'
  | 'APPLICATION_EXPIRED'
  | 'CANCELLED'
  | 'COMPLETED_WITH_CERTIFICATE';
export type RenewalTestScenario =
  | 'NO_APP_VALID'
  | 'NO_APP_EXPIRING'
  | 'NO_APP_EXPIRED'
  | 'DRAFT_EARLY_VALID'
  | 'APPROVED_EARLY_VALID'
  | 'DRAFT_EXPIRING'
  | 'SUBMITTED_EXPIRING'
  | 'APPROVED_EXPIRING'
  | 'UNDER_REVIEW_EXPIRING'
  | 'UNDER_REVIEW_EXPIRED'
  | 'CORRECTION_REQUIRED_EXPIRING'
  | 'PASS_WAITING_STICKER_EXPIRING'
  | 'DOCUMENTS_APPROVED_WAITING_CERTIFICATE_EXPIRED'
  | 'CORRECTION_REQUIRED_EXPIRED'
  | 'REJECTED_EXPIRED'
  | 'INSPECTION_FAILED_EXPIRED'
  | 'APPLICATION_EXPIRED'
  | 'CANCELLED'
  | 'COMPLETED_VALID'
  | 'COMPLETED_EXPIRED'
  | 'COMPLETED_PLUS_DRAFT'
  | 'COMPLETED_PLUS_SUBMITTED';

export interface RealisticVehicleFixture {
  owner: 1 | 2;
  scenario: RenewalTestScenario;
  registrationNumber: string;
  plateProvince: string;
  plateNumber: string;
  make: string;
  model: string;
  year: number;
  colour: string;
  seats: number;
  engineCc: number;
  powerHp: number;
  fuelType: 'PETROL' | 'DIESEL' | 'HYBRID';
  weightKg: number;
  maximumLoadKg: number;
  maximumGrossWeightKg: number;
  wheelSize: string;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  expiryOffsetDays: ExpiryOffsetDays;
  categoryCode: FamilyCategoryCode;
  workflows: readonly WorkflowScenario[];
  optionalServiceSelected: false;
}

type FamilyVehicle = Omit<
  RealisticVehicleFixture,
  | 'owner'
  | 'scenario'
  | 'registrationNumber'
  | 'plateNumber'
  | 'expiryOffsetDays'
  | 'workflows'
  | 'optionalServiceSelected'
>;

const FAMILY_VEHICLES: readonly FamilyVehicle[] = [
  {
    plateProvince: 'ភ្នំពេញ',
    make: 'Toyota',
    model: 'Camry',
    year: 2022,
    colour: 'Pearl White',
    seats: 5,
    engineCc: 2494,
    powerHp: 178,
    fuelType: 'PETROL',
    weightKg: 1515,
    maximumLoadKg: 485,
    maximumGrossWeightKg: 2000,
    wheelSize: '215/55 R17',
    lengthMm: 4805,
    widthMm: 1820,
    heightMm: 1470,
    categoryCode: 'MPWT0011524',
  },
  {
    plateProvince: 'ភ្នំពេញ',
    make: 'Toyota',
    model: 'Highlander',
    year: 2021,
    colour: 'Black',
    seats: 7,
    engineCc: 2494,
    powerHp: 186,
    fuelType: 'HYBRID',
    weightKg: 1950,
    maximumLoadKg: 770,
    maximumGrossWeightKg: 2720,
    wheelSize: '235/65 R18',
    lengthMm: 4950,
    widthMm: 1930,
    heightMm: 1730,
    categoryCode: 'MPWT0011526',
  },
  {
    plateProvince: 'ភ្នំពេញ',
    make: 'Honda',
    model: 'CR-V',
    year: 2020,
    colour: 'Metallic Grey',
    seats: 7,
    engineCc: 1498,
    powerHp: 190,
    fuelType: 'PETROL',
    weightKg: 1570,
    maximumLoadKg: 630,
    maximumGrossWeightKg: 2200,
    wheelSize: '235/60 R18',
    lengthMm: 4691,
    widthMm: 1866,
    heightMm: 1681,
    categoryCode: 'MPWT0011526',
  },
  {
    plateProvince: 'ភ្នំពេញ',
    make: 'Mazda',
    model: 'CX-5',
    year: 2019,
    colour: 'Soul Red',
    seats: 5,
    engineCc: 2488,
    powerHp: 187,
    fuelType: 'PETROL',
    weightKg: 1605,
    maximumLoadKg: 535,
    maximumGrossWeightKg: 2140,
    wheelSize: '225/55 R19',
    lengthMm: 4550,
    widthMm: 1840,
    heightMm: 1680,
    categoryCode: 'MPWT0011526',
  },
  {
    plateProvince: 'ភ្នំពេញ',
    make: 'Lexus',
    model: 'RX 350',
    year: 2018,
    colour: 'Champagne',
    seats: 5,
    engineCc: 3456,
    powerHp: 295,
    fuelType: 'PETROL',
    weightKg: 1980,
    maximumLoadKg: 600,
    maximumGrossWeightKg: 2580,
    wheelSize: '235/55 R20',
    lengthMm: 4890,
    widthMm: 1895,
    heightMm: 1710,
    categoryCode: 'MPWT0011526',
  },
  {
    plateProvince: 'ភ្នំពេញ',
    make: 'Hyundai',
    model: 'Santa Fe',
    year: 2017,
    colour: 'Silver',
    seats: 7,
    engineCc: 2199,
    powerHp: 197,
    fuelType: 'DIESEL',
    weightKg: 1915,
    maximumLoadKg: 665,
    maximumGrossWeightKg: 2580,
    wheelSize: '235/60 R18',
    lengthMm: 4770,
    widthMm: 1890,
    heightMm: 1680,
    categoryCode: 'MPWT0011526',
  },
  {
    plateProvince: 'ភ្នំពេញ',
    make: 'Kia',
    model: 'Sorento',
    year: 2016,
    colour: 'White',
    seats: 7,
    engineCc: 2199,
    powerHp: 197,
    fuelType: 'DIESEL',
    weightKg: 1949,
    maximumLoadKg: 661,
    maximumGrossWeightKg: 2610,
    wheelSize: '235/60 R18',
    lengthMm: 4780,
    widthMm: 1890,
    heightMm: 1685,
    categoryCode: 'MPWT0011526',
  },
  {
    plateProvince: 'ភ្នំពេញ',
    make: 'Mitsubishi',
    model: 'Outlander',
    year: 2015,
    colour: 'Brown',
    seats: 7,
    engineCc: 2360,
    powerHp: 166,
    fuelType: 'PETROL',
    weightKg: 1620,
    maximumLoadKg: 610,
    maximumGrossWeightKg: 2230,
    wheelSize: '225/55 R18',
    lengthMm: 4695,
    widthMm: 1810,
    heightMm: 1710,
    categoryCode: 'MPWT0011526',
  },
  {
    plateProvince: 'ភ្នំពេញ',
    make: 'Mini',
    model: 'Cooper',
    year: 2014,
    colour: 'White',
    seats: 4,
    engineCc: 1598,
    powerHp: 121,
    fuelType: 'PETROL',
    weightKg: 1140,
    maximumLoadKg: 360,
    maximumGrossWeightKg: 1500,
    wheelSize: '175/65 R15',
    lengthMm: 3729,
    widthMm: 1683,
    heightMm: 1407,
    categoryCode: 'MPWT0011525',
  },
];

const citizen2Scenarios: readonly {
  scenario: RenewalTestScenario;
  expiryOffsetDays: ExpiryOffsetDays;
  workflows: readonly WorkflowScenario[];
}[] = [
  { scenario: 'NO_APP_VALID', expiryOffsetDays: 180, workflows: [] },
  {
    scenario: 'COMPLETED_VALID',
    expiryOffsetDays: 180,
    workflows: ['COMPLETED_WITH_CERTIFICATE'],
  },
  {
    scenario: 'DRAFT_EARLY_VALID',
    expiryOffsetDays: 180,
    workflows: ['DRAFT'],
  },
  {
    scenario: 'APPROVED_EARLY_VALID',
    expiryOffsetDays: 180,
    workflows: ['READY_FOR_PHYSICAL_INSPECTION'],
  },
  { scenario: 'NO_APP_EXPIRING', expiryOffsetDays: 15, workflows: [] },
  {
    scenario: 'DRAFT_EXPIRING',
    expiryOffsetDays: 15,
    workflows: ['DRAFT'],
  },
  {
    scenario: 'SUBMITTED_EXPIRING',
    expiryOffsetDays: 15,
    workflows: ['WAITING_PAYMENT_CONFIRMATION'],
  },
  {
    scenario: 'UNDER_REVIEW_EXPIRING',
    expiryOffsetDays: 15,
    workflows: ['DOCUMENTS_UNDER_REVIEW'],
  },
  { scenario: 'NO_APP_EXPIRED', expiryOffsetDays: -10, workflows: [] },
  {
    scenario: 'CORRECTION_REQUIRED_EXPIRED',
    expiryOffsetDays: -10,
    workflows: ['CORRECTION_REQUIRED'],
  },
  {
    scenario: 'REJECTED_EXPIRED',
    expiryOffsetDays: -10,
    workflows: ['REJECTED'],
  },
  {
    scenario: 'INSPECTION_FAILED_EXPIRED',
    expiryOffsetDays: -10,
    workflows: ['PRIMARY_FAIL_TERMINAL'],
  },
  {
    scenario: 'APPLICATION_EXPIRED',
    expiryOffsetDays: -10,
    workflows: ['APPLICATION_EXPIRED'],
  },
  {
    scenario: 'CANCELLED',
    expiryOffsetDays: -10,
    workflows: ['CANCELLED'],
  },
  {
    scenario: 'COMPLETED_EXPIRED',
    expiryOffsetDays: -10,
    workflows: ['COMPLETED_WITH_CERTIFICATE'],
  },
  {
    scenario: 'COMPLETED_PLUS_DRAFT',
    expiryOffsetDays: 15,
    workflows: ['COMPLETED_WITH_CERTIFICATE', 'DRAFT'],
  },
  {
    scenario: 'COMPLETED_PLUS_SUBMITTED',
    expiryOffsetDays: 180,
    workflows: ['COMPLETED_WITH_CERTIFICATE', 'WAITING_PAYMENT_CONFIRMATION'],
  },
];

// Citizen 1 is the canonical walkthrough matrix. Citizen 2 deliberately
// retains the prior ordering above as an independent development fixture set.
const citizen1Scenarios: readonly {
  scenario: RenewalTestScenario;
  expiryOffsetDays: ExpiryOffsetDays;
  workflows: readonly WorkflowScenario[];
}[] = [
  { scenario: 'NO_APP_VALID', expiryOffsetDays: 180, workflows: [] },
  {
    scenario: 'DRAFT_EARLY_VALID',
    expiryOffsetDays: 180,
    workflows: ['DRAFT'],
  },
  {
    scenario: 'COMPLETED_VALID',
    expiryOffsetDays: 180,
    workflows: ['COMPLETED_WITH_CERTIFICATE'],
  },
  { scenario: 'NO_APP_EXPIRED', expiryOffsetDays: -10, workflows: [] },
  {
    scenario: 'SUBMITTED_EXPIRING',
    expiryOffsetDays: 15,
    workflows: ['WAITING_PAYMENT_CONFIRMATION'],
  },
  {
    scenario: 'APPROVED_EXPIRING',
    expiryOffsetDays: 15,
    workflows: ['READY_FOR_PHYSICAL_INSPECTION'],
  },
  {
    scenario: 'CORRECTION_REQUIRED_EXPIRING',
    expiryOffsetDays: 15,
    workflows: ['CORRECTION_REQUIRED'],
  },
  {
    scenario: 'PASS_WAITING_STICKER_EXPIRING',
    expiryOffsetDays: 15,
    workflows: ['PASS_WAITING_STICKER'],
  },
  {
    scenario: 'UNDER_REVIEW_EXPIRED',
    expiryOffsetDays: -10,
    workflows: ['DOCUMENTS_UNDER_REVIEW'],
  },
  {
    scenario: 'DOCUMENTS_APPROVED_WAITING_CERTIFICATE_EXPIRED',
    expiryOffsetDays: -15,
    workflows: ['DOCUMENTS_APPROVED_WAITING_CERTIFICATE'],
  },
  {
    scenario: 'INSPECTION_FAILED_EXPIRED',
    expiryOffsetDays: -25,
    workflows: ['PRIMARY_FAIL_TERMINAL'],
  },
  {
    scenario: 'REJECTED_EXPIRED',
    expiryOffsetDays: -40,
    workflows: ['REJECTED'],
  },
  {
    scenario: 'APPLICATION_EXPIRED',
    expiryOffsetDays: -50,
    workflows: ['APPLICATION_EXPIRED'],
  },
  { scenario: 'CANCELLED', expiryOffsetDays: -60, workflows: ['CANCELLED'] },
  {
    scenario: 'COMPLETED_EXPIRED',
    expiryOffsetDays: -90,
    workflows: ['COMPLETED_WITH_CERTIFICATE'],
  },
  {
    scenario: 'COMPLETED_PLUS_DRAFT',
    expiryOffsetDays: 15,
    workflows: ['COMPLETED_WITH_CERTIFICATE', 'DRAFT'],
  },
  {
    scenario: 'COMPLETED_PLUS_SUBMITTED',
    expiryOffsetDays: 180,
    workflows: ['COMPLETED_WITH_CERTIFICATE', 'WAITING_PAYMENT_CONFIRMATION'],
  },
];

export const REALISTIC_VEHICLES: readonly RealisticVehicleFixture[] = [
  ...[1, 2].flatMap((owner) =>
    (owner === 1 ? citizen1Scenarios : citizen2Scenarios).map(
      (scenario, index) => {
        const vehicle = FAMILY_VEHICLES[index % FAMILY_VEHICLES.length];
        const serial = owner === 1 ? 1001 + index : 2001 + index;
        return {
          ...vehicle,
          owner: owner as 1 | 2,
          scenario: scenario.scenario,
          registrationNumber: `VR-${vehicle.year}-${owner}${String(index + 1).padStart(4, '0')}`,
          plateNumber: `${owner === 1 ? '2AA' : '2BB'}-${serial}`,
          expiryOffsetDays: scenario.expiryOffsetDays,
          workflows: scenario.workflows,
          optionalServiceSelected: false as const,
        };
      },
    ),
  ),
];

export const WORKFLOW_APPLICATION_STATUS: Readonly<
  Record<WorkflowScenario, ApplicationStatus>
> = {
  DRAFT: ApplicationStatus.DRAFT,
  PRIMARY_FAIL_TERMINAL: ApplicationStatus.INSPECTION_FAILED,
  WAITING_PAYMENT_CONFIRMATION: ApplicationStatus.SUBMITTED,
  READY_FOR_PHYSICAL_INSPECTION: ApplicationStatus.APPROVED,
  PASS_WAITING_STICKER: ApplicationStatus.APPROVED,
  DOCUMENTS_UNDER_REVIEW: ApplicationStatus.UNDER_REVIEW,
  DOCUMENTS_APPROVED_WAITING_CERTIFICATE: ApplicationStatus.APPROVED,
  CORRECTION_REQUIRED: ApplicationStatus.CORRECTION_REQUIRED,
  CORRECTION_REPLACED_PENDING: ApplicationStatus.CORRECTION_REQUIRED,
  REJECTED: ApplicationStatus.REJECTED,
  APPLICATION_EXPIRED: ApplicationStatus.EXPIRED,
  CANCELLED: ApplicationStatus.CANCELLED,
  COMPLETED_WITH_CERTIFICATE: ApplicationStatus.COMPLETED,
};
