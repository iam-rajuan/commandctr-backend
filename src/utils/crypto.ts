import { createHash, randomUUID } from 'crypto';

export const cryptoUtils = {
  hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  },
  randomId() {
    return randomUUID();
  }
};
