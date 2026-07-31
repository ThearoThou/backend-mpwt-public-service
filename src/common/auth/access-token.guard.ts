import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { AuthTokenService } from '../../auth/auth-token.service';
import { RefreshSessionService } from '../../auth/refresh-session.service';
import { User } from '../../users/entities/user.entity';
import { UserStatus } from '../../users/enums/user-status.enum';
import { ApiErrorCode } from '../errors/api-error-code';
import { DomainException } from '../errors/domain.exception';
import type { AuthenticatedRequest } from './authenticated-actor';

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly authTokenService: AuthTokenService,
    private readonly refreshSessionService: RefreshSessionService,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.readBearerToken(request.headers.authorization);
    const claims = await this.authTokenService.verifyAccessToken(token);
    const user = await this.users.findOne({
      where: { id: claims.sub },
      select: {
        id: true,
        role: true,
        status: true,
      },
    });

    if (user === null || user.role !== claims.role) {
      throw this.invalidToken();
    }

    if (user.status === UserStatus.DISABLED) {
      throw new DomainException(
        ApiErrorCode.AUTH_ACCOUNT_DISABLED,
        HttpStatus.FORBIDDEN,
        'Account is disabled',
      );
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new DomainException(
        ApiErrorCode.AUTH_ACCOUNT_NOT_ACTIVE,
        HttpStatus.FORBIDDEN,
        'Account is not active',
      );
    }

    const session =
      await this.refreshSessionService.validateActiveSessionForUser(
        claims.sid,
        user.id,
      );

    if (session === null) {
      throw this.invalidToken();
    }

    request.actor = {
      userId: user.id,
      role: claims.role,
      sessionId: session.id,
    };

    return true;
  }

  private readBearerToken(value: string | undefined): string {
    const match = value?.match(/^Bearer ([^\s]+)$/i);

    if (match?.[1] === undefined) {
      throw this.invalidToken();
    }

    return match[1];
  }

  private invalidToken(): DomainException {
    return new DomainException(
      ApiErrorCode.AUTH_TOKEN_INVALID,
      HttpStatus.UNAUTHORIZED,
      'Authentication is required',
    );
  }
}
