import { CitizenProfile } from './entities/citizen-profile.entity';
import { User } from './entities/user.entity';
import { UserRole } from './enums/user-role.enum';
import { UserStatus } from './enums/user-status.enum';

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

export interface CitizenProfileResponse {
  id: string;
  userId: string;
  nameKh: string;
  nameEn: string;
  nationalIdNumber: string | null;
  address: string | null;
  profileImageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CurrentUserResponse {
  user: UserSummaryResponse;
  citizenProfile: CitizenProfileResponse | null;
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

export function mapCitizenProfile(
  citizenProfile: CitizenProfile,
): CitizenProfileResponse {
  return {
    id: citizenProfile.id,
    userId: citizenProfile.userId,
    nameKh: citizenProfile.nameKh,
    nameEn: citizenProfile.nameEn,
    nationalIdNumber: citizenProfile.nationalIdNumber,
    address: citizenProfile.address,
    // No profile-image route is approved in the first release, so there is no
    // authorized URL to derive from the private storage key.
    profileImageUrl: null,
    createdAt: citizenProfile.createdAt,
    updatedAt: citizenProfile.updatedAt,
  };
}

export function mapCurrentUser(
  user: User,
  citizenProfile: CitizenProfile | null,
): CurrentUserResponse {
  return {
    user: mapUserSummary(user),
    citizenProfile:
      citizenProfile === null ? null : mapCitizenProfile(citizenProfile),
  };
}
