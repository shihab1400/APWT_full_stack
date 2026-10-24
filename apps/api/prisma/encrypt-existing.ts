import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { FieldCipher, parseKey, type EncryptedField } from '../src/crypto/field-cipher.js';

/**
 * Encrypts sensitive text written before encryption at rest was enabled.
 * Safe to re-run: values that are already encrypted are skipped.
 * Usage: pnpm db:encrypt
 */
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const cipher = new FieldCipher(parseKey(process.env.DATA_ENCRYPTION_KEY ?? ''));
const PLAIN = { not: { startsWith: 'enc:v1:' } } as const;
const BATCH = 500;

async function migrate(
  field: EncryptedField,
  load: () => Promise<{ id: string; value: string | null }[]>,
  save: (id: string, value: string) => Promise<unknown>,
) {
  let total = 0;
  for (;;) {
    const rows = (await load()).filter((r) => r.value && !FieldCipher.isEncrypted(r.value));
    if (!rows.length) break;
    for (const r of rows) await save(r.id, cipher.encrypt(r.value!, field));
    total += rows.length;
  }
  console.log(`${field}: ${total} value(s) encrypted`);
}

async function main() {
  await migrate(
    'ChatMessage.content',
    async () =>
      (await prisma.chatMessage.findMany({ where: { content: PLAIN }, select: { id: true, content: true }, take: BATCH })).map(
        (r) => ({ id: r.id, value: r.content }),
      ),
    (id, value) => prisma.chatMessage.update({ where: { id }, data: { content: value } }),
  );
  await migrate(
    'ChatSession.title',
    async () =>
      (await prisma.chatSession.findMany({ where: { title: PLAIN }, select: { id: true, title: true }, take: BATCH })).map(
        (r) => ({ id: r.id, value: r.title }),
      ),
    // Keep updatedAt so conversation order doesn't change.
    async (id, value) => {
      const { updatedAt } = await prisma.chatSession.findUniqueOrThrow({ where: { id }, select: { updatedAt: true } });
      return prisma.chatSession.update({ where: { id }, data: { title: value, updatedAt } });
    },
  );
  await migrate(
    'ConsultationNote.body',
    async () =>
      (await prisma.consultationNote.findMany({ where: { body: PLAIN }, select: { id: true, body: true }, take: BATCH })).map(
        (r) => ({ id: r.id, value: r.body }),
      ),
    async (id, value) => {
      const { updatedAt } = await prisma.consultationNote.findUniqueOrThrow({ where: { id }, select: { updatedAt: true } });
      return prisma.consultationNote.update({ where: { id }, data: { body: value, updatedAt } });
    },
  );
  await migrate(
    'ConsultationMessage.body',
    async () =>
      (await prisma.consultationMessage.findMany({ where: { body: PLAIN }, select: { id: true, body: true }, take: BATCH })).map(
        (r) => ({ id: r.id, value: r.body }),
      ),
    (id, value) => prisma.consultationMessage.update({ where: { id }, data: { body: value } }),
  );
  await migrate(
    'Appointment.patientNote',
    async () =>
      (
        await prisma.appointment.findMany({
          where: { patientNote: PLAIN },
          select: { id: true, patientNote: true },
          take: BATCH,
        })
      ).map((r) => ({ id: r.id, value: r.patientNote })),
    async (id, value) => {
      const { updatedAt } = await prisma.appointment.findUniqueOrThrow({ where: { id }, select: { updatedAt: true } });
      return prisma.appointment.update({ where: { id }, data: { patientNote: value, updatedAt } });
    },
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
