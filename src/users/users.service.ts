import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { AuditLog } from '../activity/entities/audit-log.entity';
import { AuditActorType } from '../activity/enums/audit-actor-type.enum';
import {
  RefreshSessionRevocationReason,
  RefreshSessionService,
} from '../auth/refresh-session.service';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { createPaginationMeta } from '../common/pagination/pagination-meta';
import {
  ListUsersQueryDto,
  type UpdateCitizenProfileRequestDto,
  type UserSortField,
} from './dto/user-request.dtos';
import { CitizenProfile } from './entities/citizen-profile.entity';
import { User } from './entities/user.entity';
import { UserRole } from './enums/user-role.enum';
import { UserStatus } from './enums/user-status.enum';
import {
  mapCitizenProfile,
  mapCurrentUser,
  mapUserSummary,
  type CitizenProfileResponse,
  type CurrentUserResponse,
  type UserSummaryResponse,
} from './user-response.mapper';

export interface CreatePendingCitizenInput {
  phone: string | null;
  email: string | null;
  passwordHash: string;
  nameKh: string;
  nameEn: string;
  nationalIdNumber?: string;
  address?: string;
}

export interface CreateInitialAdministratorInput {
  phone: string | null;
  email: string;
  passwordHash: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(CitizenProfile)
    private readonly citizenProfiles: Repository<CitizenProfile>,
    private readonly dataSource: DataSource,
    private readonly refreshSessionService: RefreshSessionService,
  ) {}

  async createPendingCitizen(
    input: CreatePendingCitizenInput,
    manager: EntityManager,
  ): Promise<User> {
    const user = await manager.getRepository(User).save(
      manager.getRepository(User).create({
        role: UserRole.CITIZEN,
        status: UserStatus.PENDING_VERIFICATION,
        phone: input.phone,
        email: input.email,
        passwordHash: input.passwordHash,
        phoneVerifiedAt: null,
        emailVerifiedAt: null,
        lastLoginAt: null,
      }),
    );

    await manager.getRepository(CitizenProfile).save(
      manager.getRepository(CitizenProfile).create({
        userId: user.id,
        nameKh: input.nameKh,
        nameEn: input.nameEn,
        nationalIdNumber: input.nationalIdNumber ?? null,
        address: input.address ?? null,
        profileImageKey: null,
      }),
    );

    return user;
  }

  async hasIdentifierConflict(
    phone: string | null,
    email: string | null,
    manager?: EntityManager,
  ): Promise<boolean> {
    const repository = this.userRepository(manager);

    if (phone !== null && (await repository.existsBy({ phone }))) {
      return true;
    }

    return email !== null && (await repository.existsBy({ email }));
  }

  async findUserByIdentifier(
    identifier: string,
    manager?: EntityManager,
  ): Promise<User | null> {
    return this.userRepository(manager).findOne({
      where: this.identifierWhere(identifier),
      select: this.safeUserSelect(),
    });
  }

  async findLockedUserByIdentifier(
    identifier: string,
    manager: EntityManager,
  ): Promise<User | null> {
    return manager.getRepository(User).findOne({
      where: this.identifierWhere(identifier),
      lock: { mode: 'pessimistic_write' },
      select: this.safeUserSelect(),
    });
  }

  async findUserForLogin(
    identifier: string,
    manager: EntityManager,
  ): Promise<User | null> {
    return manager.getRepository(User).findOne({
      where: this.identifierWhere(identifier),
      lock: { mode: 'pessimistic_write' },
      select: {
        ...this.safeUserSelect(),
        passwordHash: true,
      },
    });
  }

  async findUserByIdForRefresh(
    userId: string,
    manager: EntityManager,
  ): Promise<User | null> {
    return manager.getRepository(User).findOne({
      where: { id: userId },
      select: this.safeUserSelect(),
    });
  }

  async activateCitizenForIdentifier(
    user: User,
    identifier: string,
    manager: EntityManager,
    now = new Date(),
  ): Promise<User | null> {
    if (user.phone === identifier) {
      user.phoneVerifiedAt = now;
    } else if (user.email === identifier) {
      user.emailVerifiedAt = now;
    } else {
      return null;
    }

    user.status = UserStatus.ACTIVE;

    return manager.getRepository(User).save(user);
  }

  async recordLogin(
    user: User,
    manager: EntityManager,
    now = new Date(),
  ): Promise<User> {
    user.lastLoginAt = now;

    return manager.getRepository(User).save(user);
  }

  async replacePassword(
    user: User,
    passwordHash: string,
    manager: EntityManager,
  ): Promise<User> {
    user.passwordHash = passwordHash;

    return manager.getRepository(User).save(user);
  }

  async getCurrentUser(userId: string): Promise<CurrentUserResponse> {
    const user = await this.users.findOne({
      where: { id: userId },
      select: this.safeUserSummarySelect(),
    });

    if (user === null) {
      throw this.userNotFound();
    }

    return mapCurrentUser(
      user,
      await this.findCitizenProfileForUser(user.id, user.role),
    );
  }

  async updateCurrentCitizenProfile(
    userId: string,
    input: UpdateCitizenProfileRequestDto,
  ): Promise<CitizenProfileResponse> {
    const patch = this.editableCitizenProfilePatch(input);

    if (Object.keys(patch).length === 0) {
      return this.getCitizenProfileResponse(userId);
    }

    try {
      const result = await this.citizenProfiles.update({ userId }, patch);

      if (result.affected === 0) {
        throw this.userNotFound();
      }
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        throw this.citizenProfileConflict();
      }

      throw error;
    }

    return this.getCitizenProfileResponse(userId);
  }

  async listUsers(input: ListUsersQueryDto): Promise<{
    data: UserSummaryResponse[];
    meta: ReturnType<typeof createPaginationMeta>;
  }> {
    this.assertCreatedRange(input);

    const query = this.users
      .createQueryBuilder('user')
      .select([
        'user.id',
        'user.phone',
        'user.email',
        'user.role',
        'user.status',
        'user.phoneVerifiedAt',
        'user.emailVerifiedAt',
        'user.createdAt',
        'user.updatedAt',
      ]);

    if (input.role !== undefined) {
      query.andWhere('user.role = :role', { role: input.role });
    }

    if (input.status !== undefined) {
      query.andWhere('user.status = :status', { status: input.status });
    }

    if (input.phone !== undefined) {
      query.andWhere('user.phone = :phone', { phone: input.phone });
    }

    if (input.email !== undefined) {
      query.andWhere('user.email = :email', { email: input.email });
    }

    if (input.createdFrom !== undefined) {
      query.andWhere('user.createdAt >= :createdFrom', {
        createdFrom: new Date(input.createdFrom),
      });
    }

    if (input.createdTo !== undefined) {
      query.andWhere('user.createdAt <= :createdTo', {
        createdTo: new Date(input.createdTo),
      });
    }

    const [users, total] = await query
      .orderBy(
        `user.${this.userSortColumn(input.sortBy)}`,
        input.sortOrder.toUpperCase() as 'ASC' | 'DESC',
      )
      .skip((input.page - 1) * input.limit)
      .take(input.limit)
      .getManyAndCount();

    return {
      data: users.map(mapUserSummary),
      meta: createPaginationMeta(input.page, input.limit, total),
    };
  }

  async getAdminUserDetail(userId: string): Promise<UserSummaryResponse> {
    const user = await this.users.findOne({
      where: { id: userId },
      select: this.safeUserSummarySelect(),
    });

    if (user === null) {
      throw this.userNotFound();
    }

    return mapUserSummary(user);
  }

  async updateUserStatus(
    actorUserId: string,
    targetUserId: string,
    status: UserStatus.ACTIVE | UserStatus.DISABLED,
  ): Promise<UserSummaryResponse> {
    if (actorUserId === targetUserId) {
      throw this.invalidStatusTransition();
    }

    return this.dataSource.transaction(async (manager) => {
      const user = await manager.getRepository(User).findOne({
        where: { id: targetUserId },
        lock: { mode: 'pessimistic_write' },
        select: this.safeUserSelect(),
      });

      if (user === null) {
        throw this.userNotFound();
      }

      if (!this.isAllowedStatusTransition(user.status, status)) {
        throw this.invalidStatusTransition();
      }

      const previousStatus = user.status;
      user.status = status;

      await manager.getRepository(User).save(user);

      if (status === UserStatus.DISABLED) {
        await this.refreshSessionService.revokeAllActiveSessionsLocked(
          user.id,
          RefreshSessionRevocationReason.ACCOUNT_DISABLED,
          manager,
        );
      }

      await manager.getRepository(AuditLog).save(
        manager.getRepository(AuditLog).create({
          actorType: AuditActorType.USER,
          actorUserId,
          applicationId: null,
          action: 'USER_STATUS_UPDATED',
          entityType: 'USER',
          entityId: user.id,
          description: 'Administrator changed a user account status.',
          oldValues: { status: previousStatus },
          newValues: { status },
          ipAddress: null,
          userAgent: null,
        }),
      );

      return mapUserSummary(user);
    });
  }

  async findInitialAdministrator(manager: EntityManager): Promise<User | null> {
    return manager.getRepository(User).findOne({
      where: { role: UserRole.ADMIN },
      select: { id: true, role: true },
    });
  }

  async createInitialAdministrator(
    input: CreateInitialAdministratorInput,
    manager: EntityManager,
    now = new Date(),
  ): Promise<User> {
    const repository = manager.getRepository(User);

    return repository.save(
      repository.create({
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        phone: input.phone,
        email: input.email,
        passwordHash: input.passwordHash,
        phoneVerifiedAt: input.phone === null ? null : now,
        emailVerifiedAt: now,
        lastLoginAt: null,
      }),
    );
  }

  private userRepository(manager?: EntityManager): Repository<User> {
    return manager?.getRepository(User) ?? this.users;
  }

  private identifierWhere(
    identifier: string,
  ): { email: string } | { phone: string } {
    return identifier.includes('@')
      ? { email: identifier }
      : { phone: identifier };
  }

  private safeUserSelect() {
    return {
      id: true,
      role: true,
      status: true,
      phone: true,
      email: true,
      phoneVerifiedAt: true,
      emailVerifiedAt: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
    };
  }

  private safeCitizenProfileSelect() {
    return {
      id: true,
      userId: true,
      nameKh: true,
      nameEn: true,
      nationalIdNumber: true,
      address: true,
      createdAt: true,
      updatedAt: true,
    };
  }

  private safeUserSummarySelect() {
    return {
      id: true,
      role: true,
      status: true,
      phone: true,
      email: true,
      phoneVerifiedAt: true,
      emailVerifiedAt: true,
      createdAt: true,
      updatedAt: true,
    };
  }

  private async findCitizenProfileForUser(
    userId: string,
    role: UserRole,
  ): Promise<CitizenProfile | null> {
    if (role !== UserRole.CITIZEN) {
      return null;
    }

    return this.citizenProfiles.findOne({
      where: { userId },
      select: this.safeCitizenProfileSelect(),
    });
  }

  private editableCitizenProfilePatch(
    input: UpdateCitizenProfileRequestDto,
  ): Partial<
    Pick<CitizenProfile, 'nameKh' | 'nameEn' | 'nationalIdNumber' | 'address'>
  > {
    return {
      ...(input.nameKh === undefined ? {} : { nameKh: input.nameKh }),
      ...(input.nameEn === undefined ? {} : { nameEn: input.nameEn }),
      ...(input.nationalIdNumber === undefined
        ? {}
        : { nationalIdNumber: input.nationalIdNumber }),
      ...(input.address === undefined ? {} : { address: input.address }),
    };
  }

  private async getCitizenProfileResponse(
    userId: string,
  ): Promise<CitizenProfileResponse> {
    const citizenProfile = await this.citizenProfiles.findOne({
      where: { userId },
      select: this.safeCitizenProfileSelect(),
    });

    if (citizenProfile === null) {
      throw this.userNotFound();
    }

    return mapCitizenProfile(citizenProfile);
  }

  private assertCreatedRange(input: ListUsersQueryDto): void {
    if (
      input.createdFrom !== undefined &&
      input.createdTo !== undefined &&
      new Date(input.createdFrom) > new Date(input.createdTo)
    ) {
      throw new DomainException(
        ApiErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        'Created date range is invalid',
      );
    }
  }

  private userSortColumn(sortBy: UserSortField): UserSortField {
    return sortBy;
  }

  private isAllowedStatusTransition(
    currentStatus: UserStatus,
    requestedStatus: UserStatus.ACTIVE | UserStatus.DISABLED,
  ): boolean {
    return (
      (currentStatus === UserStatus.ACTIVE &&
        requestedStatus === UserStatus.DISABLED) ||
      (currentStatus === UserStatus.DISABLED &&
        requestedStatus === UserStatus.ACTIVE)
    );
  }

  private userNotFound(): DomainException {
    return new DomainException(
      ApiErrorCode.USER_NOT_FOUND,
      HttpStatus.NOT_FOUND,
      'User not found',
    );
  }

  private invalidStatusTransition(): DomainException {
    return new DomainException(
      ApiErrorCode.USER_STATUS_INVALID_TRANSITION,
      HttpStatus.CONFLICT,
      'Requested status change is not permitted',
    );
  }

  private citizenProfileConflict(): DomainException {
    return new DomainException(
      ApiErrorCode.CONFLICT,
      HttpStatus.CONFLICT,
      'Citizen profile conflicts with an existing record',
    );
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
      return false;
    }

    const databaseError = error as {
      code?: unknown;
      driverError?: { code?: unknown };
    };

    return (
      databaseError.code === '23505' ||
      databaseError.driverError?.code === '23505'
    );
  }
}
