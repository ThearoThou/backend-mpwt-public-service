import type { Repository } from 'typeorm';

import { CitizenProfile } from './entities/citizen-profile.entity';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

describe('UsersService', () => {
  it('loads the login user through the transaction manager with a pessimistic write lock', async () => {
    const loginRepository = { findOne: jest.fn().mockResolvedValue(null) };
    const manager = {
      getRepository: jest.fn(() => loginRepository),
    };
    const service = new UsersService(
      {} as Repository<User>,
      {} as Repository<CitizenProfile>,
    );

    await service.findUserForLogin('citizen@example.com', manager as never);

    expect(manager.getRepository).toHaveBeenCalledWith(User);
    expect(loginRepository.findOne).toHaveBeenCalledWith({
      where: { email: 'citizen@example.com' },
      lock: { mode: 'pessimistic_write' },
      select: {
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
        passwordHash: true,
      },
    });
  });
});
