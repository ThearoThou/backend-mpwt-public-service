import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ApiErrorCode } from '../errors/api-error-code';
import { DomainException } from '../errors/domain.exception';
import type { AuthenticatedRequest } from './authenticated-actor';
import { ROLES_KEY, type SupportedUserRole } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowedRoles = this.reflector.getAllAndOverride<SupportedUserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (allowedRoles === undefined || allowedRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (
      request.actor === undefined ||
      !allowedRoles.includes(request.actor.role)
    ) {
      throw new DomainException(
        ApiErrorCode.FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Access is forbidden',
      );
    }

    return true;
  }
}
