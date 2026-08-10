import { GUARDS_METADATA } from '@nestjs/common/constants';

import { AccessTokenGuard } from '../common/auth/access-token.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { ROLES_KEY } from '../common/auth/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { AdminApplicationsController } from './admin-applications.controller';

const APPLICATION_ID = '11111111-1111-4111-8111-111111111111';

describe('AdminApplicationsController', () => {
  it('uses the existing ADMIN guard and role metadata', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdminApplicationsController)).toEqual(
      [UserRole.ADMIN],
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminApplicationsController),
    ).toEqual([AccessTokenGuard, RolesGuard]);
  });

  it('forwards admin queue, detail, and history requests with standard response envelopes', async () => {
    const service = {
      list: jest
        .fn()
        .mockResolvedValue({ data: [{ id: APPLICATION_ID }], meta: {} }),
      getDetail: jest.fn().mockResolvedValue({ id: APPLICATION_ID }),
      listStatusHistory: jest.fn().mockResolvedValue({ data: [], meta: {} }),
    };
    const controller = new AdminApplicationsController(service as never);
    const queue = {
      page: 1,
      limit: 20,
      sortOrder: 'desc',
      sortBy: 'submittedAt',
    } as const;
    const history = { page: 1, limit: 20, sortOrder: 'desc' } as const;

    await expect(controller.list(queue)).resolves.toEqual({
      data: [{ id: APPLICATION_ID }],
      meta: {},
    });
    await expect(controller.detail(APPLICATION_ID)).resolves.toEqual({
      data: { id: APPLICATION_ID },
    });
    await expect(
      controller.statusHistory(APPLICATION_ID, history),
    ).resolves.toEqual({
      data: [],
      meta: {},
    });
    expect(service.list).toHaveBeenCalledWith(queue);
    expect(service.getDetail).toHaveBeenCalledWith(APPLICATION_ID);
    expect(service.listStatusHistory).toHaveBeenCalledWith(
      APPLICATION_ID,
      history,
    );
  });
});
