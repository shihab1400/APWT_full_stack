import { randomBytes } from 'node:crypto';
import { FieldCipher, UNREADABLE, parseKey } from './field-cipher.js';

const cipher = new FieldCipher(randomBytes(32));

describe('FieldCipher', () => {
  it('round-trips text, including Bangla', () => {
    for (const text of ['I feel anxious before exams.', 'আমি ভালো নেই', '']) {
      const stored = cipher.encrypt(text, 'ChatMessage.content');
      expect(stored.startsWith('enc:v1:')).toBe(true);
      expect(cipher.decrypt(stored, 'ChatMessage.content')).toBe(text);
    }
  });

  it('never stores the plaintext and uses a fresh IV each time', () => {
    const a = cipher.encrypt('same note', 'ConsultationNote.body');
    const b = cipher.encrypt('same note', 'ConsultationNote.body');
    expect(a).not.toContain('same note');
    expect(a).not.toBe(b);
  });

  it('refuses a value moved to another column', () => {
    const stored = cipher.encrypt('secret', 'ConsultationNote.body');
    expect(cipher.decrypt(stored, 'ConsultationMessage.body')).toBe(UNREADABLE);
  });

  it('detects tampering and wrong keys', () => {
    const stored = cipher.encrypt('secret', 'ChatSession.title');
    const tampered = stored.slice(0, -4) + (stored.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    expect(cipher.decrypt(tampered, 'ChatSession.title')).toBe(UNREADABLE);
    expect(new FieldCipher(randomBytes(32)).decrypt(stored, 'ChatSession.title')).toBe(UNREADABLE);
  });

  it('reads legacy plaintext as-is so old rows can be migrated', () => {
    expect(cipher.decrypt('written before encryption', 'ChatMessage.content')).toBe('written before encryption');
    expect(cipher.decryptOptional(null, 'Appointment.patientNote')).toBeNull();
    expect(cipher.encryptOptional('', 'Appointment.patientNote')).toBeNull();
  });

  it('requires a 32-byte key', () => {
    expect(() => parseKey(randomBytes(16).toString('base64'))).toThrow('32 bytes');
    expect(parseKey(randomBytes(32).toString('base64'))).toHaveLength(32);
  });
});
