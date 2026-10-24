import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { blogPosts, demoDoctors, faqs, hotlines, quizzes } from './seed-content.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

// Safe to re-run: existing rows are left untouched, only missing ones are created.
async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@mindease.local').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin12345';

  const admin = await prisma.user.upsert({
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

  // Matched by number, so new lines are added without duplicating existing ones.
  for (const [order, h] of hotlines.entries()) {
    const existing = await prisma.hotline.findFirst({ where: { number: h.number } });
    if (!existing) await prisma.hotline.create({ data: { ...h, order } });
  }

  if ((await prisma.faq.count()) === 0) {
    await prisma.faq.createMany({ data: faqs.map((f, order) => ({ ...f, order })) });
  }

  for (const [i, post] of blogPosts.entries()) {
    await prisma.blogPost.upsert({
      where: { slug: post.slug },
      update: {},
      create: {
        ...post,
        authorId: admin.id,
        published: true,
        // Stagger dates so the list has a stable order.
        publishedAt: new Date(Date.now() - i * 3 * 86_400_000),
      },
    });
  }

  // Created once; later edits by admins are never overwritten.
  for (const { questions, ...quiz } of quizzes) {
    const exists = await prisma.quiz.findUnique({ where: { slug: quiz.slug } });
    if (exists) continue;
    await prisma.quiz.create({
      data: {
        ...quiz,
        questions: { create: questions.map((q, order) => ({ ...q, order: order + 1 })) },
      },
    });
  }

  if (process.env.NODE_ENV !== 'production') {
    const doctorPassword = await bcrypt.hash('Doctor12345', 12);
    for (const { email, name, ...profile } of demoDoctors) {
      await prisma.user.upsert({
        where: { email },
        update: {},
        create: {
          email,
          name,
          role: 'DOCTOR',
          emailVerified: true,
          consentAt: new Date(),
          passwordHash: doctorPassword,
          doctorProfile: {
            create: { ...profile, verified: true, approvalStatus: 'APPROVED' },
          },
        },
      });
    }
    console.log(`Seeded ${demoDoctors.length} demo doctors (password: Doctor12345)`);
  }

  console.log('Seeded hotlines, FAQs, articles and assessments');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
