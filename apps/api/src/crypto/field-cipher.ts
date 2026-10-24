import { Logger } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** Columns holding sensitive free text. Each is bound into its ciphertext. */
export type EncryptedField =
  | 'ChatMessage.content'
  | 'ChatSession.title'
  | 'ConsultationNote.body'
  | 'ConsultationMessage.body'
  | 'Appointment.patientNote';

const PREFIX = 'enc:v1:';
const IV_BYTES = 12;
const TAG_BYTES = 16;
export const UNREADABLE = '[This content could not be decrypted]';

/** Checks DATA_ENCRYPTION_KEY: 32 random bytes, base64-encoded. */
export function parseKey(base64: string): Buffer {
  const key = Buffer.from(base64, 'base64');
  if (key.length !== 32) throw new Error('DATA_ENCRYPTION_KEY must be 32 bytes, base64-encoded');
  return key;
}

/**
 * AES-256-GCM encryption for individual columns (data at rest).
 * Stored form: "enc:v1:" + base64(iv | tag | ciphertext). The column name is
 * authenticated data, so a value copied into another column won't decrypt.
 * Values without the prefix are treated as legacy plaintext, which lets
 * existing rows be read and then migrated (`pnpm db:encrypt`).
 */
export class FieldCipher {
  private readonly logger = new Logger(FieldCipher.name);

  constructor(private readonly key: Buffer) {}

  encrypt(plain: string, field: EncryptedField): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(field));
    const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
  }

  decrypt(stored: string, field: EncryptedField): string {
    if (!FieldCipher.isEncrypted(stored)) return stored;
    try {
      const raw = Buffer.from(stored.slice(PREFIX.length), 'base64');
      const decipher = createDecipheriv('aes-256-gcm', this.key, raw.subarray(0, IV_BYTES));
      decipher.setAAD(Buffer.from(field));
      decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
      return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8');
    } catch {
      // Wrong key or tampered value: don't take the whole page down with it.
      this.logger.error(`Could not decrypt a ${field} value`);
      return UNREADABLE;
    }
  }

  encryptOptional(plain: string | null | undefined, field: EncryptedField): string | null {
    return plain ? this.encrypt(plain, field) : null;
  }

  decryptOptional(stored: string | null, field: EncryptedField): string | null {
    return stored === null ? null : this.decrypt(stored, field);
  }

  static isEncrypted(value: string): boolean {
    return value.startsWith(PREFIX);
  }
}
