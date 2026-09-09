import { UserRole } from '../users/enums/user-role.enum';
import { ROLES_KEY } from '../common/auth/roles.decorator';
import { AdminVehiclesController } from './admin-vehicles.controller';

describe('AdminVehiclesController classification routes', () => {
  it('keeps every route, including technical updates, admin-only', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdminVehiclesController)).toEqual([
      UserRole.ADMIN,
    ]);
  });

  it('uses the authenticated admin actor for classification', async () => {
    const classifications = {
      classify: jest.fn().mockResolvedValue({ id: 'vehicle-id' }),
      listHistory: jest.fn(),
    };
    const controller = new AdminVehiclesController(
      { listAdminVehicles: jest.fn(), getAdminVehicle: jest.fn() } as never,
      classifications as never,
    );

    await controller.classifyVehicle(
      {
        userId: '11111111-1111-4111-8111-111111111111',
        role: UserRole.ADMIN,
        sessionId: 'session-id',
      },
      '22222222-2222-4222-8222-222222222222',
      {
        inspectionCategoryId: '33333333-3333-4333-8333-333333333333',
        reason: 'Corrected',
      },
    );

    expect(classifications.classify).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      {
        inspectionCategoryId: '33333333-3333-4333-8333-333333333333',
        reason: 'Corrected',
      },
    );
  });

  it('delegates technical master data updates only through the admin controller', async () => {
    const vehicles = {
      listAdminVehicles: jest.fn(),
      getAdminVehicle: jest.fn(),
      updateTechnicalData: jest.fn().mockResolvedValue({ id: 'vehicle-id' }),
    };
    const controller = new AdminVehiclesController(
      vehicles as never,
      {
        classify: jest.fn(),
        listHistory: jest.fn(),
      } as never,
    );
    const input = {
      colour: 'White',
      engineNumber: 'ENG-123',
      enginePowerHp: '177.50',
    };

    await controller.updateTechnicalData(
      '22222222-2222-4222-8222-222222222222',
      input,
    );

    expect(vehicles.updateTechnicalData).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222',
      input,
    );
  });
});
