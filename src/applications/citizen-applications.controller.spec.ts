import type { AuthenticatedActor } from '../common/auth/authenticated-actor';
import { UserRole } from '../users/enums/user-role.enum';
import { CitizenApplicationsController } from './citizen-applications.controller';

const CITIZEN_ID = '11111111-1111-4111-8111-111111111111';
const APPLICATION_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';

describe('CitizenApplicationsController', () => {
  it('forwards the authenticated citizen and only the DTO vehicle ID for draft creation', async () => {
    const applications = {
      listCitizenApplications: jest.fn(),
      getCitizenApplication: jest.fn(),
      listCitizenStatusHistory: jest.fn(),
    };
    const workflow = {
      createDraft: jest.fn().mockResolvedValue({ id: 'draft' }),
    };
    const controller = new CitizenApplicationsController(
      applications as never,
      workflow as never,
    );

    await controller.createDraft(actor(), { vehicleId: VEHICLE_ID });

    expect(workflow.createDraft).toHaveBeenCalledWith(CITIZEN_ID, VEHICLE_ID);
  });

  it('forwards citizen-scoped list, detail, and history requests', async () => {
    const applications = {
      listCitizenApplications: jest
        .fn()
        .mockResolvedValue({ data: [], meta: {} }),
      getCitizenApplication: jest
        .fn()
        .mockResolvedValue({ id: APPLICATION_ID }),
      listCitizenStatusHistory: jest
        .fn()
        .mockResolvedValue({ data: [], meta: {} }),
    };
    const controller = new CitizenApplicationsController(
      applications as never,
      {
        createDraft: jest.fn(),
      } as never,
    );
    const query = { page: 1, limit: 20, sortOrder: 'desc' } as const;

    await controller.listApplications(actor(), query);
    await controller.getApplication(actor(), APPLICATION_ID);
    await controller.listStatusHistory(actor(), APPLICATION_ID, query);

    expect(applications.listCitizenApplications).toHaveBeenCalledWith(
      CITIZEN_ID,
      query,
    );
    expect(applications.getCitizenApplication).toHaveBeenCalledWith(
      CITIZEN_ID,
      APPLICATION_ID,
    );
    expect(applications.listCitizenStatusHistory).toHaveBeenCalledWith(
      CITIZEN_ID,
      APPLICATION_ID,
      query,
    );
  });

  it('forwards submit, resubmit, and cancel transitions', async () => {
    const workflow = {
      createDraft: jest.fn(),
      submit: jest.fn().mockResolvedValue({}),
      resubmit: jest.fn().mockResolvedValue({}),
      cancel: jest.fn().mockResolvedValue({}),
    };
    const controller = new CitizenApplicationsController(
      {} as never,
      workflow as never,
    );
    await controller.submit(actor(), APPLICATION_ID);
    await controller.resubmit(actor(), APPLICATION_ID);
    await controller.cancel(actor(), APPLICATION_ID, { reason: 'trimmed' });
    expect(workflow.submit).toHaveBeenCalledWith(CITIZEN_ID, APPLICATION_ID);
    expect(workflow.resubmit).toHaveBeenCalledWith(CITIZEN_ID, APPLICATION_ID);
    expect(workflow.cancel).toHaveBeenCalledWith(
      CITIZEN_ID,
      APPLICATION_ID,
      'trimmed',
    );
  });

  it('forwards the authenticated citizen and route ID for submit and returns data', async () => {
    const serviceResult = { id: APPLICATION_ID, status: 'SUBMITTED' };
    const workflow = {
      submit: jest.fn().mockResolvedValue(serviceResult),
    };
    const controller = new CitizenApplicationsController(
      {} as never,
      workflow as never,
    );

    await expect(controller.submit(actor(), APPLICATION_ID)).resolves.toEqual({
      data: serviceResult,
    });
    expect(workflow.submit).toHaveBeenCalledWith(CITIZEN_ID, APPLICATION_ID);
  });

  it('forwards the authenticated citizen and route ID for resubmit and returns data', async () => {
    const serviceResult = { id: APPLICATION_ID, status: 'SUBMITTED' };
    const workflow = {
      resubmit: jest.fn().mockResolvedValue(serviceResult),
    };
    const controller = new CitizenApplicationsController(
      {} as never,
      workflow as never,
    );

    await expect(controller.resubmit(actor(), APPLICATION_ID)).resolves.toEqual(
      { data: serviceResult },
    );
    expect(workflow.resubmit).toHaveBeenCalledWith(CITIZEN_ID, APPLICATION_ID);
  });

  it('forwards the cancellation DTO for the authenticated citizen and returns data', async () => {
    const serviceResult = { id: APPLICATION_ID, status: 'CANCELLED' };
    const input = { reason: 'No longer required' };
    const workflow = {
      cancel: jest.fn().mockResolvedValue(serviceResult),
    };
    const controller = new CitizenApplicationsController(
      {} as never,
      workflow as never,
    );

    await expect(
      controller.cancel(actor(), APPLICATION_ID, input),
    ).resolves.toEqual({ data: serviceResult });
    expect(workflow.cancel).toHaveBeenCalledWith(
      CITIZEN_ID,
      APPLICATION_ID,
      input.reason,
    );
  });
});

function actor(): AuthenticatedActor {
  return {
    userId: CITIZEN_ID,
    role: UserRole.CITIZEN,
    sessionId: 'session-id',
  };
}
