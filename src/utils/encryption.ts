import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

import { env } from '@/config/env';

const IV_LENGTH = 12;
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

const getKey = () => createHash('sha256').update(env.ENCRYPTION_SECRET).digest();

export const encryptionUtils = {
  encrypt(value: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ENCRYPTION_ALGORITHM, getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':');
  },

  decrypt(value: string): string {
    const [ivHex, authTagHex, encryptedHex] = value.split(':');

    if (!ivHex || !authTagHex || !encryptedHex) {
      throw new Error('Encrypted payload is malformed');
    }

    const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, getKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

    const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedHex, 'hex')), decipher.final()]);
    return decrypted.toString('utf8');
  }
};
