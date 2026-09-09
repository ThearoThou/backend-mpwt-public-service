import 'reflect-metadata';

import { HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';

import { AccessTokenGuard } from '../common/auth/access-token.guard';
import type { AuthenticatedRequest } from '../common/auth/authenticated-actor';
import { ROLES_KEY } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import { DomainException } from '../common/errors/domain.exception';
import { UserRole } from '../users/enums/user-role.enum';
import { AdminApplicationReviewController } from './admin-application-review.controller';
import { DocumentType } from './enums/document-type.enum';

describe('AdminApplicationReviewController', () => {
  it('rejects a citizen through the ADMIN roles guard and uses UUID validation', async () => {
    const guard = new RolesGuard(new Reflector());
    const request: AuthenticatedRequest = {
      actor: {
        userId: 'citizen-id',
        role: UserRole.CITIZEN,
        sessionId: 'session-id',
      },
    } as AuthenticatedRequest;
    const context = {
      getHandler: () => function handler() {},
      getClass: () => AdminApplicationReviewController,
      switchToHttp: () => ({ getRequest: () => request }),
    };
    let thrown: unknown;
    try {
      guard.canActivate(context as never);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(DomainException);
    expect((thrown as DomainException).status).toBe(HttpStatus.FORBIDDEN);
    await expect(
      new ParseUUIDPipe({ version: '4' }).transform('not-a-uuid', {
        type: 'param',
      }),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
  });

  it('uses ADMIN-only guards and forwards the authenticated admin actor', async () => {
    const service = {
      startReview: jest.fn().mockResolvedValue({ id: 'application-id' }),
      requestCorrection: jest.fn().mockResolvedValue({ id: 'application-id' }),
      reject: jest.fn().mockResolvedValue({ id: 'application-id' }),
      reopen: jest.fn().mockResolvedValue({ id: 'application-id' }),
      passReview: jest.fn().mockResolvedValue({ id: 'application-id' }),
    };
    const workflow = {
      resubmitAsAdmin: jest.fn().mockResolvedValue({
        id: 'application-id',
        status: 'SUBMITTED',
      }),
    };
    const controller = new AdminApplicationReviewController(
      service as never,
      workflow as never,
    );
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
      controller.reject(actor, 'application-id', { reason: 'reject' }),
    ).resolves.toEqual({ data: { id: 'application-id' } });
    await expect(
      controller.reopen(actor, 'application-id', { reason: 'reopen' }),
    ).resolves.toEqual({ data: { id: 'application-id' } });
    await expect(
      controller.requestCorrection(actor, 'application-id', input),
    ).resolves.toEqual({ data: { id: 'application-id' } });
    await expect(controller.resubmit(actor, 'application-id')).resolves.toEqual(
      { data: { id: 'application-id', status: 'SUBMITTED' } },
    );
    expect(service.startReview).toHaveBeenCalledWith(
      'admin-id',
      'application-id',
    );
    expect(service.requestCorrection).toHaveBeenCalledWith(
      'admin-id',
      'application-id',
      input,
    );
    expect(service.reject).toHaveBeenCalledWith('admin-id', 'application-id', {
      reason: 'reject',
    });
    expect(service.reopen).toHaveBeenCalledWith('admin-id', 'application-id', {
      reason: 'reopen',
    });
    expect(workflow.resubmitAsAdmin).toHaveBeenCalledWith(
      'admin-id',
      'application-id',
    );
    expect(
      Reflect.getMetadata(ROLES_KEY, AdminApplicationReviewController),
    ).toEqual([UserRole.ADMIN]);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminApplicationReviewController),
    ).toEqual([AccessTokenGuard, RolesGuard]);
  });
});
