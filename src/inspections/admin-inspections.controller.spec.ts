import { InspectionResult } from './enums/inspection-result.enum';
import { AdminInspectionsController } from './admin-inspections.controller';

describe('AdminInspectionsController', () => {
  it('passes the authenticated admin to result recording and returns the read response wrapper', async () => {
    const detail = { appointment: { id: 'appointment-id' } };
    const reads = {
      getAdminAppointmentDetail: jest.fn().mockResolvedValue(detail),
    };
    const commands = { recordResult: jest.fn().mockResolvedValue(undefined) };
    const controller = new AdminInspectionsController(
      reads as never,
      commands as never,
    );

    await expect(
      controller.recordResult(
        '550e8400-e29b-41d4-a716-446655440000',
        { userId: 'admin-id', role: 'ADMIN', sessionId: 'session-id' },
        { result: InspectionResult.PASS },
      ),
    ).resolves.toEqual({ data: detail });
    expect(commands.recordResult).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440000',
      'admin-id',
      { result: InspectionResult.PASS },
    );
  });

  it('passes the authenticated admin to NO_SHOW recording and returns refreshed detail', async () => {
    const detail = { appointment: { id: 'appointment-id', status: 'NO_SHOW' } };
    const reads = {
      getAdminAppointmentDetail: jest.fn().mockResolvedValue(detail),
    };
    const commands = {
      markNoShowByAdmin: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new AdminInspectionsController(
      reads as never,
      commands as never,
    );

    await expect(
      controller.markNoShow('550e8400-e29b-41d4-a716-446655440000', {
        userId: 'admin-id',
        role: 'ADMIN',
        sessionId: 'session-id',
      }),
    ).resolves.toEqual({ data: detail });
    expect(commands.markNoShowByAdmin).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440000',
      'admin-id',
    );
  });
});
