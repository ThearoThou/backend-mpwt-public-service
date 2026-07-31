import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

export const AUTH_ARGON2ID_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class AuthHashingService {
  hashSecret(value: string): Promise<string> {
    return argon2.hash(value, AUTH_ARGON2ID_OPTIONS);
  }

  async verifySecret(hash: string, value: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, value);
    } catch {
      return false;
    }
  }
}
