import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client.js';
import {
  blogPosts,
  demoDoctors,
  demoPatient,
  demoWeeklyHours,
  faqs,
  hotlines,
  quizzes,
} from './seed-content.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

// Safe to re-run: existing rows are left untouched, only missing ones are created.
async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@mindease.local').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin12345';
  if (process.env.NODE_ENV === 'production' && (password === 'Admin12345' || password.length < 12)) {
    throw new Error('Set SEED_ADMIN_PASSWORD to a strong password (12+ characters) before seeding production');
  }

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
  // Privacy answers must match how the app actually behaves, so they are kept in sync.
  for (const f of faqs.filter((f) => f.category === 'Privacy & Safety')) {
    await prisma.faq.updateMany({ where: { question: f.question }, data: { answer: f.answer } });
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
      const user = await prisma.user.upsert({
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
            create: {
              ...profile,
              verified: true,
              approvalStatus: 'APPROVED',
              submittedAt: new Date(),
              reviewedAt: new Date(),
            },
          },
        },
        include: { doctorProfile: { include: { _count: { select: { availability: true } } } } },
      });
      const doctor = user.doctorProfile!;
      // Fill in fields added after the first seed, without overwriting edits.
      if (!doctor.clinicAddress && profile.clinicAddress) {
        await prisma.doctorProfile.update({
          where: { id: doctor.id },
          data: { clinicAddress: profile.clinicAddress },
        });
      }
      if (doctor._count.availability === 0) {
        await prisma.availabilitySlot.createMany({
          data: demoWeeklyHours.map((w) => ({ ...w, doctorId: doctor.id })),
        });
      }
    }
    console.log(`Seeded ${demoDoctors.length} demo doctors (password: Doctor12345)`);

    // A Premium patient so booking can be tried before payments exist (phase 5).
    const patient = await prisma.user.upsert({
      where: { email: demoPatient.email },
      update: {},
      create: {
        email: demoPatient.email,
        name: demoPatient.name,
        role: 'USER',
        emailVerified: true,
        consentAt: new Date(),
        passwordHash: await bcrypt.hash(demoPatient.password, 12),
      },
    });
    const paid = await prisma.subscription.findFirst({ where: { userId: patient.id, tier: 'PAID' } });
    if (!paid) {
      await prisma.subscription.create({
        data: {
          userId: patient.id,
          tier: 'PAID',
          endsAt: new Date(Date.now() + 365 * 86_400_000),
        },
      });
    }
    console.log(`Seeded Premium demo patient ${demoPatient.email} (password: ${demoPatient.password})`);
  }

  console.log('Seeded hotlines, FAQs, articles and assessments');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
