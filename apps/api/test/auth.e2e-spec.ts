import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { ENV, type Env } from '../src/config/env.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { configureApp } from '../src/setup.js';

// Runs against the DATABASE_URL in .env. Every account it creates uses this
// domain and is deleted afterwards.
const DOMAIN = '@e2e.mindease.test';
const email = (name: string) => `${name}-${Date.now()}${DOMAIN}`;

function cookiesOf(res: request.Response): string[] {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  return (raw ?? []).map((c) => c.split(';')[0]);
}

describe('Auth & RBAC (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get<Env>(ENV));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
    await app.close();
  });

  const register = (body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/auth/register').send(body);

  it('validates registration input', async () => {
    const res = await register({ name: 'x', email: 'nope', password: 'short', consent: false });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.errors)).toEqual(
      expect.arrayContaining(['name', 'email', 'password', 'consent']),
    );
  });

  it('registers a user, rejects a duplicate, and blocks admin routes', async () => {
    const userEmail = email('user');
    const body = { name: 'Test User', email: userEmail, password: 'Secret123', consent: true };

    const res = await register(body);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: userEmail, role: 'USER', tier: 'FREE' });
    const cookies = cookiesOf(res);
    expect(cookies.some((c) => c.startsWith('me_access='))).toBe(true);
    expect(cookies.some((c) => c.startsWith('me_refresh='))).toBe(true);

    expect((await register(body)).status).toBe(409);

    const me = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookies);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(userEmail);

    const admin = await request(app.getHttpServer())
      .get('/api/admin/users')
      .set('Cookie', cookies);
    expect(admin.status).toBe(403);
  });

  it('rejects unauthenticated requests to protected routes', async () => {
    expect((await request(app.getHttpServer()).get('/api/auth/me')).status).toBe(401);
    expect((await request(app.getHttpServer()).get('/api/admin/users')).status).toBe(401);
  });

  it('rejects self-registration as ADMIN', async () => {
    const res = await register({
      name: 'Sneaky',
      email: email('sneaky'),
      password: 'Secret123',
      role: 'ADMIN',
      consent: true,
    });
    expect(res.status).toBe(400);
  });

  it('creates a pending doctor profile on doctor registration', async () => {
    const doctorEmail = email('doctor');
    const res = await register({
      name: 'Dr Test',
      email: doctorEmail,
      password: 'Secret123',
      role: 'DOCTOR',
      consent: true,
    });
    expect(res.status).toBe(201);
    const profile = await prisma.doctorProfile.findFirst({ where: { user: { email: doctorEmail } } });
    expect(profile).toMatchObject({ approvalStatus: 'PENDING', verified: false });
  });

  it('lets an admin deactivate a user, which then cannot log in', async () => {
    const userEmail = email('victim');
    const reg = await register({ name: 'Victim', email: userEmail, password: 'Secret123', consent: true });
    const userCookies = cookiesOf(reg);

    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: process.env.SEED_ADMIN_EMAIL ?? 'admin@mindease.local',
        password: process.env.SEED_ADMIN_PASSWORD ?? 'Admin12345',
      });
    expect(adminLogin.status).toBe(200);
    expect(adminLogin.body.role).toBe('ADMIN');
    const adminCookies = cookiesOf(adminLogin);

    const list = await request(app.getHttpServer())
      .get('/api/admin/users')
      .set('Cookie', adminCookies);
    expect(list.status).toBe(200);

    const deactivate = await request(app.getHttpServer())
      .patch(`/api/admin/users/${reg.body.id}/status`)
      .set('Cookie', adminCookies)
      .send({ status: 'DEACTIVATED', reason: 'e2e test' });
    expect(deactivate.status).toBe(200);
    expect(deactivate.body.status).toBe('DEACTIVATED');

    const audit = await prisma.auditLog.findFirst({ where: { targetId: reg.body.id } });
    expect(audit).toMatchObject({ action: 'USER_DEACTIVATED', reason: 'e2e test' });

    // Existing session is cut off immediately, and new logins are refused.
    const me = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', userCookies);
    expect(me.status).toBe(403);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: userEmail, password: 'Secret123' });
    expect(login.status).toBe(403);

    await prisma.auditLog.deleteMany({ where: { targetId: reg.body.id } });
  });

  it('rotates the refresh token and detects reuse', async () => {
    const reg = await register({
      name: 'Rotator',
      email: email('rotate'),
      password: 'Secret123',
      consent: true,
    });
    const original = cookiesOf(reg);

    const first = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', original);
    expect(first.status).toBe(200);

    // Replaying the old refresh token is treated as theft and kills all sessions.
    const replay = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', original);
    expect(replay.status).toBe(401);

    const second = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', cookiesOf(first));
    expect(second.status).toBe(401);
  });

  it('logs out and revokes the refresh token', async () => {
    const reg = await register({
      name: 'Leaver',
      email: email('logout'),
      password: 'Secret123',
      consent: true,
    });
    const cookies = cookiesOf(reg);

    const out = await request(app.getHttpServer()).post('/api/auth/logout').set('Cookie', cookies);
    expect(out.status).toBe(204);

    const refresh = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', cookies);
    expect(refresh.status).toBe(401);
  });
});
