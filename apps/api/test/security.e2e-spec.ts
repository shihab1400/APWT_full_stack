import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { JwtService } from '@nestjs/jwt';
import { ACCESS_TOKEN_COOKIE } from '@mindease/shared';
import { AiService } from '../src/ai/ai.service.js';
import { AppModule } from '../src/app.module.js';
import { ENV, type Env } from '../src/config/env.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { configureApp } from '../src/setup.js';

const DOMAIN = '@e2e-p8.mindease.test';
const ENCRYPTED = /^enc:v1:/;

const fakeAi = {
  async *streamReply() {
    yield 'A private reply about your sleep.';
  },
};

describe('Security hardening (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  async function signUp(label: string, role: 'USER' | 'DOCTOR' = 'USER') {
    const user = await prisma.user.create({
      data: {
        name: `P8 ${label}`,
        email: `${label}-${Date.now()}${DOMAIN}`,
        passwordHash: 'x',
        role,
        doctorProfile: role === 'DOCTOR' ? { create: { fee: 500, verified: true, approvalStatus: 'APPROVED' } } : undefined,
      },
      include: { doctorProfile: true },
    });
    const token = await app.get(JwtService).signAsync({ sub: user.id, role, tier: 'FREE' });
    return { id: user.id, doctorId: user.doctorProfile?.id, cookies: [`${ACCESS_TOKEN_COOKIE}=${token}`] };
  }

  beforeAll(async () => {
    // Requests come from 127.0.0.1, so X-Forwarded-For is honoured as it would be behind Next.js.
    process.env.TRUST_PROXY = 'loopback';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AiService)
      .useValue(fakeAi)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get<Env>(ENV));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    const mine = { endsWith: DOMAIN };
    await prisma.appointment.deleteMany({ where: { patient: { email: mine } } });
    await prisma.contactMessage.deleteMany({ where: { email: mine } });
    await prisma.user.deleteMany({ where: { email: mine } });
    await app.close();
  });

  describe('encryption at rest', () => {
    it('stores AI chats encrypted and serves them decrypted', async () => {
      const user = await signUp('chat');
      const res = await http()
        .post('/api/chat/messages')
        .set('Cookie', user.cookies)
        .send({ content: 'I have not slept properly for weeks' })
        .expect(200);
      const sessionId = /"sessionId":"([^"]+)"/.exec(res.text)![1];

      const rows = await prisma.chatMessage.findMany({ where: { sessionId } });
      const session = await prisma.chatSession.findUniqueOrThrow({ where: { id: sessionId } });
      expect(rows).toHaveLength(2);
      for (const value of [...rows.map((r) => r.content), session.title!]) {
        expect(value).toMatch(ENCRYPTED);
        expect(value).not.toMatch(/slept|sleep/);
      }

      const api = await http().get(`/api/chat/sessions/${sessionId}/messages`).set('Cookie', user.cookies).expect(200);
      expect(api.body.map((m: { content: string }) => m.content)).toEqual([
        'I have not slept properly for weeks',
        'A private reply about your sleep.',
      ]);
      const sessions = await http().get('/api/chat/sessions').set('Cookie', user.cookies).expect(200);
      expect(sessions.body[0].title).toBe('I have not slept properly for weeks');
    });

    it('stores consultation messages and notes encrypted', async () => {
      const doctor = await signUp('doc', 'DOCTOR');
      const patient = await signUp('patient');
      const startsAt = new Date(Date.now() + 5 * 60_000);
      const appt = await prisma.appointment.create({
        data: {
          patientId: patient.id,
          doctorId: doctor.doctorId!,
          type: 'ONLINE',
          status: 'ACCEPTED',
          startsAt,
          endsAt: new Date(startsAt.getTime() + 3_600_000),
        },
      });

      await http().post(`/api/consultations/${appt.id}/messages`).set('Cookie', patient.cookies).send({ body: 'My panic attacks are worse' }).expect(201);
      await http().post(`/api/doctor/appointments/${appt.id}/notes`).set('Cookie', doctor.cookies).send({ body: 'Discussed panic triggers' }).expect(201);

      const [message] = await prisma.consultationMessage.findMany({ where: { appointmentId: appt.id } });
      const [note] = await prisma.consultationNote.findMany({ where: { appointmentId: appt.id } });
      expect(message.body).toMatch(ENCRYPTED);
      expect(note.body).toMatch(ENCRYPTED);
      expect(`${message.body}${note.body}`).not.toMatch(/panic/);

      const thread = await http().get(`/api/consultations/${appt.id}`).set('Cookie', doctor.cookies).expect(200);
      expect(thread.body.messages[0].body).toBe('My panic attacks are worse');
      const record = await http().get(`/api/doctor/patients/${patient.id}`).set('Cookie', doctor.cookies).expect(200);
      expect(record.body.appointments[0].notes[0].body).toBe('Discussed panic triggers');
    });
  });

  describe('rate limits', () => {
    it('limits each signed-in user separately, even from the same address', async () => {
      const busy = await signUp('busy');
      const other = await signUp('other');
      const book = (who: { cookies: string[] }) => http().post('/api/appointments').set('Cookie', who.cookies).send({});
      for (let i = 0; i < 10; i++) await book(busy).expect(400);
      await book(busy).expect(429);
      await book(other).expect(400); // not blocked by someone else's traffic
    });

    it('limits guests per visitor address behind a proxy', async () => {
      const contact = (ip: string, n: number) =>
        http()
          .post('/api/contact')
          .set('X-Forwarded-For', ip)
          .send({ name: 'Rate test', email: `guest-${n}${DOMAIN}`, message: 'Testing the contact rate limit.' });
      for (let i = 0; i < 5; i++) await contact('203.0.113.10', i).expect(201);
      await contact('203.0.113.10', 5).expect(429);
      await contact('203.0.113.20', 6).expect(201);
    });
  });
});
