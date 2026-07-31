import type { Request } from 'express';

import { UserRole } from '../../users/enums/user-role.enum';

export interface AuthenticatedActor {
  userId: string;
  role: UserRole.CITIZEN | UserRole.ADMIN;
  sessionId: string;
}

export interface AuthenticatedRequest extends Request {
  actor?: AuthenticatedActor;
}
