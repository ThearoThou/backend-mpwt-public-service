import { VerificationPurpose } from './enums/verification-purpose.enum';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';

export interface UserSummaryResponse {
  id: string;
  phone: string | null;
  email: string | null;
  role: UserRole;
  status: UserStatus;
  phoneVerifiedAt: Date | null;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthTokenResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: UserSummaryResponse;
}

export interface RegistrationResponse {
  message: string;
  verificationRequired: boolean;
  destinationHint: string | null;
  development?: {
    developmentCode: string;
    purpose: VerificationPurpose;
  };
}

export function mapUserSummary(user: User): UserSummaryResponse {
  return {
    id: user.id,
    phone: user.phone,
    email: user.email,
    role: user.role,
    status: user.status,
    phoneVerifiedAt: user.phoneVerifiedAt,
    emailVerifiedAt: user.emailVerifiedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export interface RegistrationResponseOptions {
  destination?: string | null;
  developmentCode?: string;
  purpose?: VerificationPurpose;
  verificationRequired?: boolean;
  message?: string;
}

export function createRegistrationResponse(
  options: RegistrationResponseOptions = {},
): RegistrationResponse {
  const {
    destination = null,
    developmentCode,
    purpose = VerificationPurpose.REGISTER_ACCOUNT,
    verificationRequired = true,
    message = 'If the account is eligible, a verification code has been created.',
  } = options;

  return {
    message,
    verificationRequired,
    destinationHint: destination === null ? null : maskDestination(destination),
    ...(developmentCode === undefined
      ? {}
      : { development: { developmentCode, purpose } }),
  };
}

function maskDestination(destination: string): string {
  if (destination.includes('@')) {
    const [localPart, domain] = destination.split('@');
    const firstCharacter = localPart?.[0] ?? '';

    return `${firstCharacter}***@${domain}`;
  }

  return `${destination.slice(0, 4)}******${destination.slice(-3)}`;
}
