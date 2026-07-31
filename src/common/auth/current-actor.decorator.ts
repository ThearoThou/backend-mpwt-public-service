import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import type {
  AuthenticatedActor,
  AuthenticatedRequest,
} from './authenticated-actor';

export const CurrentActor = createParamDecorator(
  (
    _data: unknown,
    context: ExecutionContext,
  ): AuthenticatedActor | undefined => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    return request.actor;
  },
);
