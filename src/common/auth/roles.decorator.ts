import { SetMetadata } from '@nestjs/common';

import { UserRole } from '../../users/enums/user-role.enum';

export const ROLES_KEY = 'mpwt:roles';

export type SupportedUserRole = UserRole.CITIZEN | UserRole.ADMIN;

export const Roles = (...roles: SupportedUserRole[]) =>
  SetMetadata(ROLES_KEY, roles);
