import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@mindease.local').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin12345';

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: 'Platform Admin',
      role: 'ADMIN',
      emailVerified: true,
      consentAt: new Date(),
      passwordHash: await bcrypt.hash(password, 12),
    },
  });
  console.log(`Seeded admin: ${email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
