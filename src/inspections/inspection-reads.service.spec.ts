import 'reflect-metadata';

import { AdminInspectionQueueQueryDto } from './dto/inspection-query.dtos';
import { InspectionValidityRule } from './enums/inspection-validity-rule.enum';
import { InspectionReadsService } from './inspection-reads.service';

describe('InspectionReadsService', () => {
  it('treats an omitted view exactly as PENDING and binds station/date filters', async () => {
    const calls: Array<{ statement: string; parameters: unknown[] }> = [];
    const query = jest.fn((statement: string, parameters: unknown[]) => {
      calls.push({ statement, parameters });
      return Promise.resolve([queueRow()]);
    });
    const service = new InspectionReadsService({ query } as never);
    const omitted = Object.assign(new AdminInspectionQueueQueryDto(), {
      stationId: '550e8400-e29b-41d4-a716-446655440000',
      capacityDate: '2026-08-14',
    });
    const explicit = { ...omitted, view: 'PENDING' as const };

    await service.listAdminQueue(omitted);
    await service.listAdminQueue(explicit);

    expect(calls[0]).toEqual(calls[1]);
    expect(calls[0]?.parameters).toEqual([
      omitted.stationId,
      omitted.capacityDate,
      20,
      0,
    ]);
    expect(calls[0]?.statement).toContain(
      'application."status" = \'APPROVED\'::"public"."application_status"',
    );
    expect(calls[0]?.statement).toContain(
      'payment."status" = \'CONFIRMED\'::"public"."payment_status"',
    );
    expect(calls[0]?.statement).toContain(
      'appointment."status" = \'SCHEDULED\'::"public"."appointment_status"',
    );
    expect(calls[0]?.statement).toContain('inspection."id" IS NULL');
    expect(calls[0]?.statement).toContain(
      'capacity."capacity_date" >= ((now() AT TIME ZONE \'Asia/Phnom_Penh\')::date)',
    );
    expect(calls[0]?.statement).toContain('completed."completedPassCount" = 0');
    expect(calls[0]?.statement).toContain(
      'completed."completedFailCount" <= 1',
    );
  });

  it('maps completed PASS and FAIL inspections without exposing a recorder', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        queueRow({
          inspectionId: 'inspection-id',
          inspectionStatus: 'COMPLETED',
          inspectionAttemptNumber: 1,
          inspectionResult: 'PASS',
          inspectedAt: new Date(),
          validUntil: '2028-08-14',
          validityRule:
            InspectionValidityRule.FAMILY_VEHICLE_UP_TO_4_PERSONS_RENEWAL,
          completedPassCount: 1,
        }),
      ])
      .mockResolvedValueOnce([
        queueRow({
          inspectionId: 'inspection-id',
          inspectionStatus: 'COMPLETED',
          inspectionAttemptNumber: 2,
          inspectionResult: 'FAIL',
          failureReason: 'Brake issue',
          inspectedAt: new Date(),
          completedFailCount: 2,
        }),
      ]);
    const service = new InspectionReadsService({ query } as never);

    const passed = await service.listAdminQueue(queueInput('PASSED'));
    expect(passed).toMatchObject({
      data: [
        {
          queueView: 'PASSED',
          inspection: {
            result: 'PASS',
            validUntil: '2028-08-14',
            validityRule:
              InspectionValidityRule.FAMILY_VEHICLE_UP_TO_4_PERSONS_RENEWAL,
          },
        },
      ],
    });
    const failed = await service.listAdminQueue(queueInput('FAILED'));
    expect(failed.data[0]).toMatchObject({
      queueView: 'FAILED',
      inspection: { result: 'FAIL', failureReason: 'Brake issue' },
    });
    expect(failed.data[0]).not.toHaveProperty('recordedByUserId');
  });

  it('derives pending attempts only from completed FAIL inspections, so NO_SHOW does not consume an attempt', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([queueRow({ completedFailCount: 0 })])
      .mockResolvedValueOnce([queueRow({ completedFailCount: 1 })]);
    const service = new InspectionReadsService({ query } as never);

    await expect(
      service.listAdminQueue(queueInput('PENDING')),
    ).resolves.toMatchObject({
      data: [{ attemptNumber: 1 }],
    });
    await expect(
      service.listAdminQueue(queueInput('PENDING')),
    ).resolves.toMatchObject({
      data: [{ attemptNumber: 2 }],
    });
  });

  it('rejects prior PASS and two completed FAILs instead of deriving another pending attempt', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([queueRow({ completedPassCount: 1 })])
      .mockResolvedValueOnce([queueRow({ completedFailCount: 2 })]);
    const service = new InspectionReadsService({ query } as never);

    await expect(
      service.listAdminQueue(queueInput('PENDING')),
    ).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      service.listAdminQueue(queueInput('PENDING')),
    ).rejects.toMatchObject({
      status: 409,
    });
  });

  it('honors ascending and descending queue ordering', async () => {
    const statements: string[] = [];
    const query = jest.fn((statement: string) => {
      statements.push(statement);
      return Promise.resolve([queueRow()]);
    });
    const service = new InspectionReadsService({ query } as never);

    await service.listAdminQueue(queueInput('PENDING', 'asc'));
    await service.listAdminQueue(queueInput('PENDING', 'desc'));

    expect(statements[0]).toContain(
      'ORDER BY capacity."capacity_date" ASC, appointment."id" ASC',
    );
    expect(statements[1]).toContain(
      'ORDER BY capacity."capacity_date" DESC, appointment."id" DESC',
    );
  });

  it('derives detail action flags and rejects legacy slot appointments', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([detailRow({ isToday: true })])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([detailRow({ isPast: true })])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        detailRow({ dailyCapacityId: null, slotId: 'slot-id' }),
      ]);
    const service = new InspectionReadsService({ query } as never);

    await expect(
      service.getAdminAppointmentDetail('appointment-id'),
    ).resolves.toMatchObject({ canRecordResult: true, canMarkNoShow: false });
    await expect(
      service.getAdminAppointmentDetail('appointment-id'),
    ).resolves.toMatchObject({ canRecordResult: false, canMarkNoShow: true });
    await expect(
      service.getAdminAppointmentDetail('appointment-id'),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('keeps detail actions unavailable for future, completed, and unpaid appointments', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([detailRow()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        detailRow({
          isToday: true,
          inspectionId: 'inspection-id',
          inspectionStatus: 'COMPLETED',
          inspectionAttemptNumber: 1,
          inspectionResult: 'PASS',
          inspectedAt: new Date(),
          completedPassCount: 1,
        }),
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        detailRow({ isToday: true, paymentStatus: 'PENDING' }),
      ])
      .mockResolvedValueOnce([]);
    const service = new InspectionReadsService({ query } as never);

    await expect(
      service.getAdminAppointmentDetail('appointment-id'),
    ).resolves.toMatchObject({ canRecordResult: false, canMarkNoShow: false });
    await expect(
      service.getAdminAppointmentDetail('appointment-id'),
    ).resolves.toMatchObject({
      inspection: { result: 'PASS' },
      canRecordResult: false,
      canMarkNoShow: false,
    });
    await expect(
      service.getAdminAppointmentDetail('appointment-id'),
    ).resolves.toMatchObject({ canRecordResult: false, canMarkNoShow: false });
  });

  it('rejects a contradictory prior PASS, too many FAILs, and a pending inspection in detail', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([detailRow({ completedPassCount: 1 })])
      .mockResolvedValueOnce([detailRow({ completedFailCount: 2 })])
      .mockResolvedValueOnce([
        detailRow({
          inspectionId: 'inspection-id',
          inspectionStatus: 'PENDING',
        }),
      ]);
    const service = new InspectionReadsService({ query } as never);

    await expect(
      service.getAdminAppointmentDetail('appointment-id'),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.getAdminAppointmentDetail('appointment-id'),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.getAdminAppointmentDetail('appointment-id'),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('returns an application-based attempt with its recorded actual station', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        applicationId: 'application-id',
        referenceNumber: 'VIR-1',
        applicationStatus: 'APPROVED',
        inspectionId: 'inspection-id',
        inspectionStatus: 'COMPLETED',
        inspectionAttemptNumber: 1,
        inspectionResult: 'PASS',
        inspectedAt: new Date('2026-08-14T03:00:00.000Z'),
        failureReason: null,
        stationId: 'actual-station-id',
        stationCode: 'ST-2',
        stationNameKh: 'Station Kh',
        stationNameEn: 'Station',
      },
    ]);
    const service = new InspectionReadsService({ query } as never);

    await expect(
      service.getAdminApplicationInspectionDetail('application-id'),
    ).resolves.toMatchObject({
      application: { referenceNumber: 'VIR-1' },
      inspection: {
        attemptNumber: 1,
        station: { id: 'actual-station-id', code: 'ST-2' },
      },
    });
    expect(querySql(query, 0)).toContain('inspection."actual_station_id"');
  });
});

function queueInput(
  view: 'PENDING' | 'PASSED' | 'FAILED',
  sortOrder: 'asc' | 'desc' = 'asc',
) {
  return { page: 1, limit: 20, sortOrder, view };
}

function queueRow(overrides: Record<string, unknown> = {}) {
  return {
    applicationId: 'application-id',
    referenceNumber: 'VIR-1',
    appointmentId: 'appointment-id',
    capacityDate: '2026-08-14',
    stationId: 'station-id',
    stationCode: 'ST-1',
    stationNameKh: 'Station Kh',
    stationNameEn: 'Station',
    registrationNumber: 'REG-1',
    plateNumber: '2AB-1234',
    make: 'Toyota',
    model: 'Prius',
    inspectionId: null,
    inspectionStatus: null,
    inspectionAttemptNumber: null,
    inspectionResult: null,
    inspectedAt: null,
    failureReason: null,
    validUntil: null,
    validityRule: null,
    completedFailCount: 0,
    completedPassCount: 0,
    total: 1,
    ...overrides,
  };
}

function detailRow(overrides: Record<string, unknown> = {}) {
  return {
    ...queueRow(),
    appointmentStatus: 'SCHEDULED',
    dailyCapacityId: 'capacity-id',
    slotId: null,
    applicationStatus: 'APPROVED',
    vehicleSnapshot: {
      registrationNumber: 'REG-1',
      plateNumber: '2AB-1234',
      make: 'Toyota',
      model: 'Prius',
    },
    stationProvince: 'Phnom Penh',
    stationAddress: 'Address',
    stationPhone: null,
    paymentStatus: 'CONFIRMED',
    isToday: false,
    isPast: false,
    ...overrides,
  };
}

function querySql(query: jest.Mock, index: number): string {
  const calls = query.mock.calls as unknown as unknown[][];
  const statement = calls[index]?.[0];
  return typeof statement === 'string' ? statement : '';
}
