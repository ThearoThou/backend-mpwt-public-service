import { ExecutionContext } from '@nestjs/common';
import type { Repository } from 'typeorm';

import { AuthTokenService } from '../../auth/auth-token.service';
import { RefreshSessionService } from '../../auth/refresh-session.service';
import { User } from '../../users/entities/user.entity';
import { UserRole } from '../../users/enums/user-role.enum';
import { UserStatus } from '../../users/enums/user-status.enum';
import { ApiErrorCode } from '../errors/api-error-code';
import { DomainException } from '../errors/domain.exception';
import type { AuthenticatedRequest } from './authenticated-actor';
import { AccessTokenGuard } from './access-token.guard';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';

function createRequest(authorization?: string): AuthenticatedRequest {
  return { headers: { authorization } } as AuthenticatedRequest;
}

function createContext(request: AuthenticatedRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function createUser(status = UserStatus.ACTIVE): User {
  return {
    id: USER_ID,
    role: UserRole.CITIZEN,
    status,
  } as User;
}

function invalidToken(): DomainException {
  return new DomainException(
    ApiErrorCode.AUTH_TOKEN_INVALID,
    401,
    'Authentication is required',
  );
}

describe('AccessTokenGuard', () => {
  let tokenService: jest.Mocked<Pick<AuthTokenService, 'verifyAccessToken'>>;
  let sessionService: jest.Mocked<
    Pick<RefreshSessionService, 'validateActiveSessionForUser'>
  >;
  let users: jest.Mocked<Pick<Repository<User>, 'findOne'>>;
  let guard: AccessTokenGuard;

  beforeEach(() => {
    tokenService = { verifyAccessToken: jest.fn() };
    sessionService = { validateActiveSessionForUser: jest.fn() };
    users = { findOne: jest.fn() };
    guard = new AccessTokenGuard(
      tokenService as AuthTokenService,
      sessionService as RefreshSessionService,
      users as unknown as Repository<User>,
    );
  });

  it('rejects missing and malformed Bearer headers', async () => {
    await expect(
      guard.canActivate(createContext(createRequest())),
    ).rejects.toMatchObject({
      code: ApiErrorCode.AUTH_TOKEN_INVALID,
    });
    await expect(
      guard.canActivate(createContext(createRequest('Basic token'))),
    ).rejects.toMatchObject({ code: ApiErrorCode.AUTH_TOKEN_INVALID });
    expect(tokenService.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('rejects malformed or wrong-type tokens through the token verifier', async () => {
    tokenService.verifyAccessToken.mockRejectedValue(invalidToken());

    await expect(
      guard.canActivate(createContext(createRequest('Bearer malformed-token'))),
    ).rejects.toMatchObject({ code: ApiErrorCode.AUTH_TOKEN_INVALID });
  });

  it('rejects inactive and disabled users with their approved error codes', async () => {
    tokenService.verifyAccessToken.mockResolvedValue({
      sub: USER_ID,
      role: UserRole.CITIZEN,
      sid: SESSION_ID,
      typ: 'access',
    });
    users.findOne.mockResolvedValueOnce(
      createUser(UserStatus.PENDING_VERIFICATION),
    );

    await expect(
      guard.canActivate(createContext(createRequest('Bearer token'))),
    ).rejects.toMatchObject({ code: ApiErrorCode.AUTH_ACCOUNT_NOT_ACTIVE });

    users.findOne.mockResolvedValueOnce(createUser(UserStatus.DISABLED));
    await expect(
      guard.canActivate(createContext(createRequest('Bearer token'))),
    ).rejects.toMatchObject({ code: ApiErrorCode.AUTH_ACCOUNT_DISABLED });
  });

  it('rejects revoked, expired, and mismatched sessions without disclosure', async () => {
    tokenService.verifyAccessToken.mockResolvedValue({
      sub: USER_ID,
      role: UserRole.CITIZEN,
      sid: SESSION_ID,
      typ: 'access',
    });
    users.findOne.mockResolvedValue(createUser());
    sessionService.validateActiveSessionForUser.mockResolvedValue(null);

    await expect(
      guard.canActivate(createContext(createRequest('Bearer token'))),
    ).rejects.toMatchObject({ code: ApiErrorCode.AUTH_TOKEN_INVALID });
  });

  it('attaches only the safe actor for a valid active user and session', async () => {
    const request = createRequest('Bearer token');
    tokenService.verifyAccessToken.mockResolvedValue({
      sub: USER_ID,
      role: UserRole.CITIZEN,
      sid: SESSION_ID,
      typ: 'access',
    });
    users.findOne.mockResolvedValue(createUser());
    sessionService.validateActiveSessionForUser.mockResolvedValue({
      id: SESSION_ID,
    } as Awaited<
      ReturnType<RefreshSessionService['validateActiveSessionForUser']>
    >);

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(users.findOne).toHaveBeenCalledWith({
      where: { id: USER_ID },
      select: {
        id: true,
        role: true,
        status: true,
      },
    });
    expect(request.actor).toEqual({
      userId: USER_ID,
      role: UserRole.CITIZEN,
      sessionId: SESSION_ID,
    });
  });
});
