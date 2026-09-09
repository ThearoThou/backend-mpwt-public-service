import { mapRenewalApplication } from './application-response.mapper';
import {
  mapAdminApplicationDetail,
  mapAdminApplicationQueue,
} from './admin-application-response.mapper';
import { ApplicationStatus } from './enums/application-status.enum';

describe('admin application response mappers', () => {
  it('maps a compact queue row without exposing full snapshots', () => {
    const mapped = mapAdminApplicationQueue(application() as never);

    expect(mapped).toEqual(
      expect.objectContaining({
        applicantNameKh: 'អ្នកសាកល្បង',
        applicantNameEn: 'Test Citizen',
        nationalIdNumber: 'ID-123456',
        plateNumber: '2AB-1234',
        registrationNumber: 'REG-001',
      }),
    );
    expect(mapped).not.toHaveProperty('applicantSnapshot');
    expect(mapped).not.toHaveProperty('vehicleSnapshot');
  });

  it('defensively maps missing snapshot summary fields as null', () => {
    const mapped = mapAdminApplicationQueue({
      ...application(),
      applicantSnapshot: null,
      vehicleSnapshot: { plateNumber: 1 },
    } as never);

    expect(mapped.applicantNameKh).toBeNull();
    expect(mapped.nationalIdNumber).toBeNull();
    expect(mapped.plateNumber).toBeNull();
    expect(mapped.registrationNumber).toBeNull();
  });

  it('maps snapshots only in the admin detail response', () => {
    const source = application();
    const detail = mapAdminApplicationDetail(source as never);
    const citizen = mapRenewalApplication(source as never);

    expect(detail.applicantSnapshot).toBe(source.applicantSnapshot);
    expect(detail.vehicleSnapshot).toBe(source.vehicleSnapshot);
    expect(citizen).not.toHaveProperty('applicantSnapshot');
    expect(citizen).not.toHaveProperty('vehicleSnapshot');
  });

  it('preserves typed technical snapshot values in admin detail', () => {
    const source = {
      ...application(),
      vehicleSnapshot: {
        ...application().vehicleSnapshot,
        colour: 'White',
        engineNumber: 'ENGINE-001',
        enginePowerHp: '177.50',
        lengthMm: 5250,
      },
    };

    expect(mapAdminApplicationDetail(source as never).vehicleSnapshot).toEqual(
      expect.objectContaining({
        colour: 'White',
        engineNumber: 'ENGINE-001',
        enginePowerHp: '177.50',
        lengthMm: 5250,
      }),
    );
  });
});

function application() {
  return {
    id: 'application-id',
    referenceNumber: 'VIR-20260810-ABCDEF123456',
    citizenId: 'citizen-id',
    vehicleId: 'vehicle-id',
    status: ApplicationStatus.SUBMITTED,
    currentCorrectionReason: null,
    currentRejectionReason: null,
    submittedAt: new Date('2026-08-10T00:00:00.000Z'),
    reviewStartedAt: null,
    readyForInspectionAt: null,
    completedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    createdAt: new Date('2026-08-10T00:00:00.000Z'),
    updatedAt: new Date('2026-08-10T00:00:00.000Z'),
    applicantSnapshot: {
      nameKh: 'អ្នកសាកល្បង',
      nameEn: 'Test Citizen',
      nationalIdNumber: 'ID-123456',
    },
    vehicleSnapshot: {
      plateNumber: '2AB-1234',
      registrationNumber: 'REG-001',
    },
  };
}
