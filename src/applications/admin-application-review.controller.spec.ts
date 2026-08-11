import 'reflect-metadata';

import { GUARDS_METADATA } from '@nestjs/common/constants';

import { AccessTokenGuard } from '../common/auth/access-token.guard';
import { ROLES_KEY } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import { UserRole } from '../users/enums/user-role.enum';
import { AdminApplicationReviewController } from './admin-application-review.controller';
import { DocumentType } from './enums/document-type.enum';

describe('AdminApplicationReviewController', () => {
  it('uses ADMIN-only guards and forwards the authenticated admin actor', async () => {
    const service = {
      startReview: jest.fn().mockResolvedValue({ id: 'application-id' }),
      requestCorrection: jest.fn().mockResolvedValue({ id: 'application-id' }),
    };
    const controller = new AdminApplicationReviewController(service as never);
    const actor = {
      userId: 'admin-id',
      role: UserRole.ADMIN,
      sessionId: 'session-id',
    };
    const input = {
      documentTypes: [DocumentType.CITIZEN_ID_CARD],
      reason: 'reason',
    };

    await expect(
      controller.startReview(actor, 'application-id'),
    ).resolves.toEqual({ data: { id: 'application-id' } });
    await expect(
      controller.requestCorrection(actor, 'application-id', input),
    ).resolves.toEqual({ data: { id: 'application-id' } });
    expect(service.startReview).toHaveBeenCalledWith(
      'admin-id',
      'application-id',
    );
    expect(service.requestCorrection).toHaveBeenCalledWith(
      'admin-id',
      'application-id',
      input,
    );
    expect(
      Reflect.getMetadata(ROLES_KEY, AdminApplicationReviewController),
    ).toEqual([UserRole.ADMIN]);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminApplicationReviewController),
    ).toEqual([AccessTokenGuard, RolesGuard]);
  });
});
