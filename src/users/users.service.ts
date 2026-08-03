import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { CitizenProfile } from './entities/citizen-profile.entity';
import { User } from './entities/user.entity';
import { UserRole } from './enums/user-role.enum';
import { UserStatus } from './enums/user-status.enum';

export interface CreatePendingCitizenInput {
  phone: string | null;
  email: string | null;
  passwordHash: string;
  nameKh: string;
  nameEn: string;
  nationalIdNumber?: string;
  address?: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(CitizenProfile)
    private readonly citizenProfiles: Repository<CitizenProfile>,
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
}
