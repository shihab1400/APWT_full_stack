import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { ENV, type Env } from '../src/config/env.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { configureApp } from '../src/setup.js';

// Needs the seed data (pnpm db:seed). Everything created here is removed afterwards.
const DOMAIN = '@e2e-public.mindease.test';

describe('Public content (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get<Env>(ENV));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.contactMessage.deleteMany({ where: { email: { endsWith: DOMAIN } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
    await app.close();
  });

  it('serves published articles without login, with cache headers', async () => {
    const list = await http().get('/api/content/blogs').expect(200);
    expect(list.headers['cache-control']).toContain('public');
    expect(list.body.length).toBeGreaterThan(0);
    expect(list.body[0]).not.toHaveProperty('body');

    const post = await http().get(`/api/content/blogs/${list.body[0].slug}`).expect(200);
    expect(post.body.body.length).toBeGreaterThan(0);
    expect(post.body.readMinutes).toBeGreaterThanOrEqual(1);

    await http().get('/api/content/blogs/does-not-exist').expect(404);
  });

  it('hides unpublished articles', async () => {
    await prisma.blogPost.create({
      data: { slug: 'e2e-draft', title: 'Draft', body: 'secret', published: false },
    });
    try {
      await http().get('/api/content/blogs/e2e-draft').expect(404);
      const list = await http().get('/api/content/blogs').expect(200);
      expect(list.body.map((p: { slug: string }) => p.slug)).not.toContain('e2e-draft');
    } finally {
      await prisma.blogPost.delete({ where: { slug: 'e2e-draft' } });
    }
  });

  it('groups FAQs by category', async () => {
    const res = await http().get('/api/content/faqs').expect(200);
    expect(res.body.length).toBeGreaterThan(1);
    for (const group of res.body) {
      expect(typeof group.category).toBe('string');
      expect(group.items.length).toBeGreaterThan(0);
    }
  });

  it('lists the 999 emergency line', async () => {
    const res = await http().get('/api/content/hotlines').expect(200);
    expect(res.body.map((h: { number: string }) => h.number)).toContain('999');
  });

  it('reports plans and the consultation fee range', async () => {
    const res = await http().get('/api/content/pricing').expect(200);
    expect(res.body.plans.map((p: { tier: string }) => p.tier)).toEqual(['FREE', 'PAID']);
    expect(res.body.consultationFees.min).toBeLessThanOrEqual(res.body.consultationFees.max);
  });

  describe('doctor directory', () => {
    it('shows verified doctors with public fields only', async () => {
      const res = await http().get('/api/doctors').expect(200);
      expect(res.body.length).toBeGreaterThan(0);
      const doctor = res.body[0];
      expect(Object.keys(doctor).sort()).toEqual(
        [
          'bio',
          'experienceYears',
          'fee',
          'id',
          'name',
          'qualifications',
          'rating',
          'reviewCount',
          'specialization',
        ].sort(),
      );
      await http().get(`/api/doctors/${doctor.id}`).expect(200);
    });

    it('hides doctors who are not approved', async () => {
      const pending = await prisma.user.create({
        data: {
          email: `pending${DOMAIN}`,
          name: 'Dr. Pending',
          passwordHash: 'x',
          role: 'DOCTOR',
          doctorProfile: { create: { specialization: 'Psychiatrist', fee: 500 } },
        },
        include: { doctorProfile: true },
      });
      const list = await http().get('/api/doctors').expect(200);
      expect(list.body.map((d: { name: string }) => d.name)).not.toContain('Dr. Pending');
      await http().get(`/api/doctors/${pending.doctorProfile!.id}`).expect(404);
    });

    it('filters by search text', async () => {
      const res = await http().get('/api/doctors?q=psychiatr').expect(200);
      expect(res.body.length).toBeGreaterThan(0);
      for (const d of res.body) expect(d.specialization.toLowerCase()).toContain('psychiatr');
    });
  });

  describe('contact form', () => {
    it('stores a message and returns a reference', async () => {
      const res = await http()
        .post('/api/contact')
        .send({ name: 'Guest', email: `guest${DOMAIN}`, message: 'How do I book a doctor?' })
        .expect(201);
      expect(res.body.reference).toMatch(/^ME-[0-9A-F]{8}$/);
      const stored = await prisma.contactMessage.findFirst({ where: { email: `guest${DOMAIN}` } });
      expect(stored?.message).toBe('How do I book a doctor?');
    });

    it('rejects invalid input', async () => {
      const res = await http().post('/api/contact').send({ name: '', email: 'x', message: 'hi' });
      expect(res.status).toBe(400);
      expect(Object.keys(res.body.errors)).toEqual(
        expect.arrayContaining(['name', 'email', 'message']),
      );
    });

    it('keeps the support inbox admin-only', async () => {
      await http().get('/api/admin/contact-messages').expect(401);
    });
  });
});
