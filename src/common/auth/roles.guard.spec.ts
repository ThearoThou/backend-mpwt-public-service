import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { UserRole } from '../../users/enums/user-role.enum';
import { ApiErrorCode } from '../errors/api-error-code';
import { DomainException } from '../errors/domain.exception';
import type { AuthenticatedRequest } from './authenticated-actor';
import { RolesGuard } from './roles.guard';

function createContext(
  actor?: AuthenticatedRequest['actor'],
): ExecutionContext {
  return {
    getHandler: () => class Handler {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => ({ actor }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let reflector: jest.Mocked<Pick<Reflector, 'getAllAndOverride'>>;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new RolesGuard(reflector as Reflector);
  });

  it('allows routes without role metadata', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('allows permitted roles and rejects forbidden actors', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

    expect(
      guard.canActivate(
        createContext({
          userId: '11111111-1111-4111-8111-111111111111',
          role: UserRole.ADMIN,
          sessionId: '22222222-2222-4222-8222-222222222222',
        }),
      ),
    ).toBe(true);

    let thrown: unknown;

    try {
      guard.canActivate(
        createContext({
          userId: '11111111-1111-4111-8111-111111111111',
          role: UserRole.CITIZEN,
          sessionId: '22222222-2222-4222-8222-222222222222',
        }),
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DomainException);
    expect(thrown).toMatchObject({ code: ApiErrorCode.FORBIDDEN });
  });
});
