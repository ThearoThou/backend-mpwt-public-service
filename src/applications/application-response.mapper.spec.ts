import { ApplicationStatus } from './enums/application-status.enum';
import {
  mapCitizenApplicationDetail,
  mapCitizenApplicationList,
  mapRenewalApplication,
} from './application-response.mapper';
import { mapRenewalApplicationStatusHistory } from './application-status-history-response.mapper';
import { InspectionResult } from '../inspections/enums/inspection-result.enum';
import { PaymentStatus } from '../payments/enums/payment-status.enum';

describe('application response mappers', () => {
  it('maps a draft without a reference number or submission timestamp', () => {
    const application = {
      id: 'application-id',
      referenceNumber: null,
      citizenId: 'citizen-id',
      vehicleId: 'vehicle-id',
      status: ApplicationStatus.DRAFT,
      currentCorrectionReason: null,
      currentRejectionReason: null,
      preferredInspectionStationId: null,
      preferredInspectionDate: null,
      submittedAt: null,
      reviewStartedAt: null,
      readyForInspectionAt: null,
      completedAt: null,
      cancelledAt: null,
      cancellationReason: null,
      createdAt: new Date('2026-08-07T00:00:00.000Z'),
      updatedAt: new Date('2026-08-07T00:00:00.000Z'),
      applicantSnapshot: null,
      vehicleSnapshot: null,
    };

    const mapped = mapRenewalApplication(application as never);

    expect(mapped).toEqual(
      expect.objectContaining({
        referenceNumber: null,
        currentRejectionReason: null,
        preferredInspectionStationId: null,
        preferredInspectionDate: null,
        submittedAt: null,
        status: ApplicationStatus.DRAFT,
      }),
    );
    expect(mapped).not.toHaveProperty('applicantSnapshot');
    expect(mapped).not.toHaveProperty('vehicleSnapshot');
  });

  it('maps an initial history record with a null previous status', () => {
    expect(
      mapRenewalApplicationStatusHistory({
        id: 'history-id',
        applicationId: 'application-id',
        previousStatus: null,
        newStatus: ApplicationStatus.DRAFT,
        changedByUserId: 'citizen-id',
        createdAt: new Date('2026-08-07T00:00:00.000Z'),
      } as never),
    ).toEqual({
      id: 'history-id',
      applicationId: 'application-id',
      previousStatus: null,
      newStatus: ApplicationStatus.DRAFT,
      changedByUserId: 'citizen-id',
      createdAt: new Date('2026-08-07T00:00:00.000Z'),
    });
  });

  it('exposes submitted reference fields but excludes persistence snapshots', () => {
    const mapped = mapRenewalApplication({
      id: 'id',
      referenceNumber: 'VIR-20260810-A3F7C92D18BE',
      citizenId: 'c',
      vehicleId: 'v',
      status: ApplicationStatus.SUBMITTED,
      submittedAt: new Date(),
      applicantSnapshot: { secret: true },
      vehicleSnapshot: { secret: true },
      cancelledByUserId: 'c',
      currentCorrectionReason: null,
      currentRejectionReason: 'The inspection result was rejected.',
      preferredInspectionStationId: 'station-id',
      preferredInspectionDate: '2026-08-12',
      reviewStartedAt: null,
      readyForInspectionAt: null,
      completedAt: null,
      cancelledAt: null,
      cancellationReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    expect(mapped.referenceNumber).toMatch(/^VIR-/);
    expect(mapped.submittedAt).toBeInstanceOf(Date);
    expect(mapped.currentRejectionReason).toBe(
      'The inspection result was rejected.',
    );
    expect(mapped.preferredInspectionStationId).toBe('station-id');
    expect(mapped.preferredInspectionDate).toBe('2026-08-12');
    expect(mapped).not.toHaveProperty('applicantSnapshot');
    expect(mapped).not.toHaveProperty('vehicleSnapshot');
    expect(mapped).not.toHaveProperty('cancelledByUserId');
  });

  it('exposes submitted fields but not persistence-only fields for a cancelled application', () => {
    const submittedAt = new Date('2026-08-10T00:00:00.000Z');
    const mapped = mapRenewalApplication({
      id: 'id',
      referenceNumber: 'VIR-20260810-A3F7C92D18BE',
      citizenId: 'c',
      vehicleId: 'v',
      status: ApplicationStatus.CANCELLED,
      submittedAt,
      applicantSnapshot: { secret: true },
      vehicleSnapshot: { secret: true },
      cancelledByUserId: 'c',
      currentCorrectionReason: null,
      currentRejectionReason: null,
      preferredInspectionStationId: null,
      preferredInspectionDate: null,
      reviewStartedAt: null,
      readyForInspectionAt: null,
      completedAt: null,
      cancelledAt: new Date('2026-08-10T01:00:00.000Z'),
      cancellationReason: 'No longer required',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    expect(mapped.referenceNumber).toBe('VIR-20260810-A3F7C92D18BE');
    expect(mapped.submittedAt).toBe(submittedAt);
    expect(mapped.currentRejectionReason).toBeNull();
    expect(mapped).not.toHaveProperty('applicantSnapshot');
    expect(mapped).not.toHaveProperty('vehicleSnapshot');
    expect(mapped).not.toHaveProperty('cancelledByUserId');
  });

  it('maps a legacy vehicle snapshot safely without live technical fallback', () => {
    const mapped = mapCitizenApplicationDetail({
      id: 'id',
      referenceNumber: 'VIR-20260810-A3F7C92D18BE',
      citizenId: 'c',
      vehicleId: 'v',
      status: ApplicationStatus.SUBMITTED,
      currentCorrectionReason: null,
      currentRejectionReason: null,
      preferredInspectionStationId: null,
      preferredInspectionDate: null,
      submittedAt: new Date(),
      reviewStartedAt: null,
      readyForInspectionAt: null,
      completedAt: null,
      cancelledAt: null,
      cancellationReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      vehicleSnapshot: {
        vehicleId: 'v',
        registrationNumber: 'REG-001',
        plateNumber: '1A-1234',
        plateCategory: 'PROVINCE',
        plateProvince: 'Phnom Penh',
        plateType: 'PRIVATE',
        vehicleType: 'CAR',
        vehicleClass: 'LIGHT',
        inspectionCategoryId: 'category-id',
        make: 'Toyota',
        model: 'Prius',
        manufactureYear: 2020,
        chassisNumber: 'CHASSIS-001',
        firstRegistrationDate: '2020-01-01',
        lastInspectionDate: null,
        inspectionExpiryDate: '2026-01-01',
        registeredOwnerNameKh: 'Citizen Khmer',
        registeredOwnerNameEn: 'Citizen English',
        registeredOwnerPhone: '012345678',
        secret: 'must not leak',
      },
    } as never);

    expect(mapped.vehicleSnapshot).toEqual({
      vehicleId: 'v',
      registrationNumber: 'REG-001',
      plateNumber: '1A-1234',
      plateCategory: 'PROVINCE',
      plateProvince: 'Phnom Penh',
      plateType: 'PRIVATE',
      vehicleType: 'CAR',
      vehicleClass: 'LIGHT',
      inspectionCategoryId: 'category-id',
      make: 'Toyota',
      model: 'Prius',
      manufactureYear: 2020,
      chassisNumber: 'CHASSIS-001',
      firstRegistrationDate: '2020-01-01',
      lastInspectionDate: null,
      inspectionExpiryDate: '2026-01-01',
      registeredOwnerNameKh: 'Citizen Khmer',
      registeredOwnerNameEn: 'Citizen English',
      registeredOwnerPhone: '012345678',
      colour: null,
      engineNumber: null,
      numberOfCylinders: null,
      engineDisplacementCc: null,
      enginePowerHp: null,
      fuelType: null,
      numberOfSeats: null,
      numberOfAxles: null,
      steering: null,
      vehicleWeightKg: null,
      maximumLoadKg: null,
      maximumGrossWeightKg: null,
      wheelSize: null,
      lengthMm: null,
      widthMm: null,
      heightMm: null,
    });
    expect(mapped.vehicleSnapshot).not.toHaveProperty('secret');
  });

  it('keeps a draft vehicle snapshot null and maps nullable list summaries', () => {
    const application = {
      id: 'id',
      referenceNumber: null,
      citizenId: 'c',
      vehicleId: 'v',
      status: ApplicationStatus.DRAFT,
      currentCorrectionReason: null,
      currentRejectionReason: null,
      preferredInspectionStationId: null,
      preferredInspectionDate: null,
      submittedAt: null,
      reviewStartedAt: null,
      readyForInspectionAt: null,
      completedAt: null,
      cancelledAt: null,
      cancellationReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      vehicleSnapshot: null,
      vehicle: null,
      payment: null,
      latestInspection: null,
    };

    expect(
      mapCitizenApplicationDetail(application as never).vehicleSnapshot,
    ).toBeNull();
    expect(mapCitizenApplicationList(application as never)).toMatchObject({
      vehicle: null,
      payment: null,
      inspection: null,
    });
  });

  it('maps list vehicle, payment, and latest inspection summaries', () => {
    const mapped = mapCitizenApplicationList({
      id: 'id',
      referenceNumber: 'VIR-20260810-A3F7C92D18BE',
      citizenId: 'c',
      vehicleId: 'v',
      status: ApplicationStatus.APPROVED,
      currentCorrectionReason: null,
      currentRejectionReason: null,
      preferredInspectionStationId: null,
      preferredInspectionDate: null,
      submittedAt: new Date(),
      reviewStartedAt: null,
      readyForInspectionAt: null,
      completedAt: null,
      cancelledAt: null,
      cancellationReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      vehicleSnapshot: {
        registrationNumber: 'REG-001',
        plateNumber: '1A-1234',
        plateCategory: 'PROVINCE',
        plateProvince: 'Phnom Penh',
        make: 'Toyota',
        model: 'Prius',
        manufactureYear: 2020,
      },
      vehicle: {
        registrationNumber: 'REG-001',
        plateNumber: '1A-1234',
        plateCategory: 'PROVINCE',
        plateProvince: 'Phnom Penh',
        make: 'Toyota',
        model: 'Prius',
        manufactureYear: 2020,
      },
      payment: {
        status: PaymentStatus.CONFIRMED,
        totalAmount: '25000.00',
        currency: 'KHR',
      },
      latestInspection: { result: InspectionResult.PASS },
    } as never);

    expect(mapped).toMatchObject({
      vehicle: { registrationNumber: 'REG-001', manufactureYear: 2020 },
      payment: {
        status: PaymentStatus.CONFIRMED,
        totalAmount: '25000.00',
        currency: 'KHR',
      },
      inspection: { result: InspectionResult.PASS },
    });
  });

  it('uses submitted vehicle snapshot summary instead of later live vehicle changes', () => {
    const mapped = mapCitizenApplicationList({
      id: 'id',
      referenceNumber: 'VIR-20260810-A3F7C92D18BE',
      citizenId: 'c',
      vehicleId: 'v',
      status: ApplicationStatus.SUBMITTED,
      currentCorrectionReason: null,
      currentRejectionReason: null,
      preferredInspectionStationId: null,
      preferredInspectionDate: null,
      submittedAt: new Date(),
      reviewStartedAt: null,
      readyForInspectionAt: null,
      completedAt: null,
      cancelledAt: null,
      cancellationReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      vehicleSnapshot: {
        registrationNumber: 'HISTORICAL-REG',
        plateNumber: 'HISTORICAL-PLATE',
        plateCategory: 'PROVINCE',
        plateProvince: 'Phnom Penh',
        make: 'Historical Make',
        model: 'Historical Model',
        manufactureYear: 2020,
      },
      vehicle: {
        registrationNumber: 'MUTATED-REG',
        plateNumber: 'MUTATED-PLATE',
        plateCategory: 'PROVINCE',
        plateProvince: 'Siem Reap',
        make: 'Mutated Make',
        model: 'Mutated Model',
        manufactureYear: 2026,
      },
      payment: null,
      latestInspection: null,
    } as never);

    expect(mapped.vehicle).toEqual({
      registrationNumber: 'HISTORICAL-REG',
      plateNumber: 'HISTORICAL-PLATE',
      plateCategory: 'PROVINCE',
      plateProvince: 'Phnom Penh',
      make: 'Historical Make',
      model: 'Historical Model',
      manufactureYear: 2020,
    });
  });

  it('uses the live vehicle summary for a draft without a snapshot', () => {
    const mapped = mapCitizenApplicationList({
      id: 'id',
      referenceNumber: null,
      citizenId: 'c',
      vehicleId: 'v',
      status: ApplicationStatus.DRAFT,
      currentCorrectionReason: null,
      currentRejectionReason: null,
      preferredInspectionStationId: null,
      preferredInspectionDate: null,
      submittedAt: null,
      reviewStartedAt: null,
      readyForInspectionAt: null,
      completedAt: null,
      cancelledAt: null,
      cancellationReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      vehicleSnapshot: null,
      vehicle: {
        registrationNumber: 'LIVE-REG',
        plateNumber: 'LIVE-PLATE',
        plateCategory: 'PROVINCE',
        plateProvince: 'Phnom Penh',
        make: 'Live Make',
        model: 'Live Model',
        manufactureYear: 2024,
      },
      payment: null,
      latestInspection: null,
    } as never);

    expect(mapped.vehicle).toEqual({
      registrationNumber: 'LIVE-REG',
      plateNumber: 'LIVE-PLATE',
      plateCategory: 'PROVINCE',
      plateProvince: 'Phnom Penh',
      make: 'Live Make',
      model: 'Live Model',
      manufactureYear: 2024,
    });
  });

  it('does not use a live vehicle fallback for a submitted application with a missing snapshot', () => {
    const mapped = mapCitizenApplicationList({
      id: 'id',
      referenceNumber: 'VIR-20260810-A3F7C92D18BE',
      citizenId: 'c',
      vehicleId: 'v',
      status: ApplicationStatus.SUBMITTED,
      currentCorrectionReason: null,
      currentRejectionReason: null,
      preferredInspectionStationId: null,
      preferredInspectionDate: null,
      submittedAt: new Date(),
      reviewStartedAt: null,
      readyForInspectionAt: null,
      completedAt: null,
      cancelledAt: null,
      cancellationReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      vehicleSnapshot: null,
      vehicle: {
        registrationNumber: 'MUTATED-REG',
        plateNumber: 'MUTATED-PLATE',
        plateCategory: 'PROVINCE',
        plateProvince: 'Siem Reap',
        make: 'Mutated Make',
        model: 'Mutated Model',
        manufactureYear: 2026,
      },
      payment: null,
      latestInspection: null,
    } as never);

    expect(mapped.vehicle).toBeNull();
  });
});
