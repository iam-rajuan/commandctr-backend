import { randomBytes } from 'crypto';

export const tokenUtils = {
  generate(length = 32) {
    return randomBytes(length).toString('hex');
  }
};
