import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { LicenseMimeType } from '@mindease/shared';
import { ENV, type Env } from '../config/env.js';

/** The parts of a Multer upload we use (memory storage). */
export interface UploadedFileLike {
  buffer: Buffer;
  size: number;
  originalname: string;
}

const EXTENSION: Record<LicenseMimeType, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

/**
 * Detects the real type from the file's first bytes. The browser-supplied
 * MIME type and file name are not trusted.
 */
export function sniffLicenseType(buffer: Buffer): LicenseMimeType | null {
  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  return null;
}

/** Private files on local disk; nothing here is served statically. */
@Injectable()
export class LicenseStorage {
  private readonly root: string;

  constructor(@Inject(ENV) env: Env) {
    this.root = resolve(env.UPLOAD_DIR, 'licenses');
  }

  async save(buffer: Buffer, type: LicenseMimeType): Promise<string> {
    await mkdir(this.root, { recursive: true });
    const key = `${randomUUID()}.${EXTENSION[type]}`;
    await writeFile(join(this.root, key), buffer, { flag: 'wx' });
    return key;
  }

  open(key: string): ReadStream {
    return createReadStream(this.pathOf(key));
  }

  async remove(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }

  private pathOf(key: string): string {
    // Keys are generated here, but never let one escape the folder.
    if (!/^[0-9a-f-]{36}\.(pdf|png|jpg)$/.test(key)) throw new Error('Invalid file key');
    return join(this.root, key);
  }
}
