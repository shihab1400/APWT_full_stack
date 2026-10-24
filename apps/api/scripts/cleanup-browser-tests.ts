import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

/** Deletes everything the Playwright journeys created (accounts ending in BROWSER_TEST_DOMAIN). */
export const BROWSER_TEST_DOMAIN = '@e2e-pw.mindease.test';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  const mine = { endsWith: BROWSER_TEST_DOMAIN };
  await prisma.payment.deleteMany({ where: { user: { email: mine } } });
  await prisma.review.deleteMany({ where: { user: { email: mine } } });
  await prisma.appointment.deleteMany({ where: { patient: { email: mine } } });
  // Requests and payments also notified the seeded doctor and admins.
  await prisma.notification.deleteMany({ where: { OR: [{ title: { contains: 'PW Patient' } }, { body: { contains: 'PW Patient' } }] } });
  const { count } = await prisma.user.deleteMany({ where: { email: mine } });
  console.log(`Browser test cleanup: removed ${count} test account(s)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
