import { CitizenApplicationInspectionsController } from './citizen-application-inspections.controller';
import { CitizenInspectionsController } from './citizen-inspections.controller';

describe('citizen inspection controllers', () => {
  it('forwards citizen ownership context and wraps status data', async () => {
    const reads = {
      getCitizenApplicationStatus: jest
        .fn()
        .mockResolvedValue({ applicationId: 'application-id' }),
    };
    const controller = new CitizenApplicationInspectionsController(
      reads as never,
      {} as never,
    );
    await expect(controller.status('application-id', actor())).resolves.toEqual(
      { data: { applicationId: 'application-id' } },
    );
    expect(reads.getCitizenApplicationStatus).toHaveBeenCalledWith(
      'citizen-id',
      'application-id',
    );
  });

  it('forwards replacement availability and booking requests', async () => {
    const replacements = {
      availableDates: jest.fn().mockResolvedValue({ availableDates: [] }),
      book: jest.fn().mockResolvedValue({ appointmentId: 'appointment-id' }),
    };
    const controller = new CitizenApplicationInspectionsController(
      {} as never,
      replacements as never,
    );

    await expect(
      controller.availableDates('application-id', 'station-id', actor()),
    ).resolves.toEqual({ data: { availableDates: [] } });
    await expect(
      controller.book('application-id', actor(), {
        stationId: 'station-id',
        capacityDate: '2026-09-01',
      }),
    ).resolves.toEqual({ data: { appointmentId: 'appointment-id' } });
  });

  it('forwards citizen history pagination and wraps it', async () => {
    const reads = {
      listCitizenInspectionHistory: jest.fn().mockResolvedValue({
        data: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
      }),
    };
    const controller = new CitizenInspectionsController(reads as never);
    await expect(
      controller.history(actor(), { page: 1, limit: 20, sortOrder: 'desc' }),
    ).resolves.toEqual({
      data: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
  });
});

function actor() {
  return { userId: 'citizen-id', role: 'CITIZEN', sessionId: 'session-id' };
}
