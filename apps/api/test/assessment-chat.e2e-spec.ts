import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { JwtService } from '@nestjs/jwt';
import { ACCESS_TOKEN_COOKIE, FREE_DAILY_CHAT_LIMIT } from '@mindease/shared';
import { AiService } from '../src/ai/ai.service.js';
import { AppModule } from '../src/app.module.js';
import { CRISIS_OVER_LIMIT_REPLY, FALLBACK_REPLY } from '../src/chat/chat.service.js';
import { ENV, type Env } from '../src/config/env.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { configureApp } from '../src/setup.js';

// Needs seed data (pnpm db:seed). Gemini is replaced by a fake so runs are fast and free.
const DOMAIN = '@e2e-p3.mindease.test';

const fakeAi = {
  calls: 0,
  fail: false,
  async *streamReply() {
    fakeAi.calls++;
    if (fakeAi.fail) throw new Error('model unavailable');
    yield 'I hear you. ';
    yield 'That sounds hard.';
  },
};

type SseEvent = { event: string; data: any };
function parseSse(body: string): SseEvent[] {
  return body
    .split('\n\n')
    .filter((block) => block.startsWith('event:'))
    .map((block) => {
      const [eventLine, dataLine] = block.split('\n');
      return { event: eventLine.slice(7), data: JSON.parse(dataLine.slice(6)) };
    });
}

describe('Assessment & AI chat (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  // Users are created directly (registration is rate limited and covered in auth.e2e-spec).
  async function signUp(name: string, role: 'USER' | 'DOCTOR' = 'USER') {
    const user = await prisma.user.create({
      data: { name, email: `${name}-${Date.now()}${DOMAIN}`, passwordHash: 'x', role },
    });
    const token = await app.get(JwtService).signAsync({ sub: user.id, role, tier: 'FREE' });
    return { id: user.id, cookies: [`${ACCESS_TOKEN_COOKIE}=${token}`] };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AiService)
      .useValue(fakeAi)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get<Env>(ENV));
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(() => {
    fakeAi.calls = 0;
    fakeAi.fail = false;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
    await app.close();
  });

  describe('self-assessment', () => {
    let user: { id: string; cookies: string[] };
    let phq9: { id: string; questions: { options: unknown[] }[] };

    beforeAll(async () => {
      user = await signUp('quiz');
      const list = await http().get('/api/assessment/quizzes').set('Cookie', user.cookies).expect(200);
      const id = list.body.find((q: { slug: string }) => q.slug === 'phq-9').id;
      phq9 = (await http().get(`/api/assessment/quizzes/${id}`).set('Cookie', user.cookies)).body;
    });

    const submit = (answers: number[]) =>
      http()
        .post(`/api/assessment/quizzes/${phq9.id}/attempts`)
        .set('Cookie', user.cookies)
        .send({ answers });

    it('is for users only', async () => {
      const doctor = await signUp('quizdoc', 'DOCTOR');
      await http().get('/api/assessment/quizzes').set('Cookie', doctor.cookies).expect(403);
      await http().get('/api/assessment/quizzes').expect(401);
    });

    it('serves questions without revealing scores', () => {
      expect(phq9.questions).toHaveLength(9);
      expect(phq9.questions[0].options[0]).toEqual({ label: 'Not at all' });
    });

    it('scores a low result without an alert or doctor recommendation', async () => {
      const res = await submit([1, 0, 1, 0, 0, 0, 0, 0, 0]).expect(201);
      expect(res.body).toMatchObject({ score: 2, maxScore: 27, riskLevel: 'LOW', recommendDoctor: false });
      expect(res.body.doctors).toEqual([]);
    });

    it('recommends doctors and logs an alert for high-risk answers (FR_7)', async () => {
      const res = await submit(Array(9).fill(3)).expect(201);
      expect(res.body).toMatchObject({ score: 27, riskLevel: 'HIGH', recommendDoctor: true, critical: true });
      expect(res.body.doctors.length).toBeGreaterThan(0);
      const alert = await prisma.riskAlert.findFirst({ where: { sourceId: res.body.attemptId } });
      expect(alert).toMatchObject({ source: 'QUIZ', severity: 'HIGH', userId: user.id });
    });

    it('treats any self-harm answer as high risk', async () => {
      const res = await submit([0, 0, 0, 0, 0, 0, 0, 0, 1]).expect(201);
      expect(res.body).toMatchObject({ score: 1, riskLevel: 'HIGH', critical: true });
    });

    it('rejects incomplete or invalid answers', async () => {
      await submit([0, 0]).expect(400);
      await submit([0, 0, 0, 0, 0, 0, 0, 0, 9]).expect(400);
    });

    it('keeps a history of results', async () => {
      const res = await http().get('/api/assessment/attempts').set('Cookie', user.cookies).expect(200);
      expect(res.body.length).toBeGreaterThanOrEqual(3);
      expect(res.body[0]).toHaveProperty('quizTitle', 'Mood check (PHQ-9)');
    });
  });

  describe('AI chat', () => {
    const send = (cookies: string[], body: Record<string, unknown>) =>
      http().post('/api/chat/messages').set('Cookie', cookies).send(body);

    it('streams a reply and stores the conversation (FR_6)', async () => {
      const user = await signUp('chat');
      const res = await send(user.cookies, { content: 'I am feeling stressed.' }).expect(200);
      expect(res.headers['content-type']).toContain('text/event-stream');

      const events = parseSse(res.text);
      expect(events.map((e) => e.event)).toEqual(['session', 'delta', 'delta', 'done']);
      const { sessionId, title } = events[0].data;
      expect(title).toBe('I am feeling stressed.');
      expect(events[3].data.usage).toMatchObject({ used: 1, limit: FREE_DAILY_CHAT_LIMIT });

      const second = await send(user.cookies, { sessionId, content: 'Exams mostly.' }).expect(200);
      expect(parseSse(second.text)[0].data.sessionId).toBe(sessionId);

      const messages = await http()
        .get(`/api/chat/sessions/${sessionId}/messages`)
        .set('Cookie', user.cookies)
        .expect(200);
      expect(messages.body.map((m: { role: string; content: string }) => [m.role, m.content])).toEqual([
        ['USER', 'I am feeling stressed.'],
        ['ASSISTANT', 'I hear you. That sounds hard.'],
        ['USER', 'Exams mostly.'],
        ['ASSISTANT', 'I hear you. That sounds hard.'],
      ]);

      const sessions = await http().get('/api/chat/sessions').set('Cookie', user.cookies).expect(200);
      expect(sessions.body).toHaveLength(1);
    });

    it("keeps conversations private to their owner", async () => {
      const owner = await signUp('owner');
      const intruder = await signUp('intruder');
      const res = await send(owner.cookies, { content: 'private' }).expect(200);
      const { sessionId } = parseSse(res.text)[0].data;

      await http().get(`/api/chat/sessions/${sessionId}/messages`).set('Cookie', intruder.cookies).expect(404);
      await send(intruder.cookies, { sessionId, content: 'hi' }).expect(404);
      await http().delete(`/api/chat/sessions/${sessionId}`).set('Cookie', intruder.cookies).expect(404);
      await http().delete(`/api/chat/sessions/${sessionId}`).set('Cookie', owner.cookies).expect(204);
    });

    it('shows hotlines and logs an alert for crisis language', async () => {
      const user = await signUp('crisis');
      const res = await send(user.cookies, { content: 'I want to kill myself' }).expect(200);
      const events = parseSse(res.text);

      const crisis = events.find((e) => e.event === 'crisis');
      expect(crisis?.data.hotlines.map((h: { number: string }) => h.number)).toEqual(
        expect.arrayContaining(['999', '01568978234']),
      );
      expect(fakeAi.calls).toBe(1); // still answered supportively

      const userMessageId = events[0].data.userMessageId;
      expect(await prisma.chatMessage.findUnique({ where: { id: userMessageId } })).toMatchObject({ flagged: true });
      const alert = await prisma.riskAlert.findFirst({ where: { sourceId: userMessageId } });
      expect(alert).toMatchObject({ source: 'CHAT', severity: 'HIGH' });
    });

    it('stops free users at the daily limit but never blocks a crisis (FR_14)', async () => {
      const user = await signUp('limit');
      const session = await prisma.chatSession.create({ data: { userId: user.id, title: 'old' } });
      await prisma.chatMessage.createMany({
        data: Array.from({ length: FREE_DAILY_CHAT_LIMIT }, () => ({
          sessionId: session.id,
          role: 'USER' as const,
          content: 'hi',
        })),
      });

      const usage = await http().get('/api/chat/usage').set('Cookie', user.cookies).expect(200);
      expect(usage.body).toMatchObject({ used: FREE_DAILY_CHAT_LIMIT, limit: FREE_DAILY_CHAT_LIMIT });

      const blocked = await send(user.cookies, { content: 'one more?' }).expect(429);
      expect(blocked.body.code).toBe('CHAT_LIMIT_REACHED');

      const crisis = await send(user.cookies, { content: "I don't want to live anymore" }).expect(200);
      const events = parseSse(crisis.text);
      expect(events.some((e) => e.event === 'crisis')).toBe(true);
      expect(events.filter((e) => e.event === 'delta').map((e) => e.data.text).join('')).toBe(
        CRISIS_OVER_LIMIT_REPLY,
      );
      expect(fakeAi.calls).toBe(0);
    });

    it('gives paid users unlimited messages', async () => {
      const user = await signUp('paid');
      await prisma.subscription.create({ data: { userId: user.id, tier: 'PAID' } });
      const usage = await http().get('/api/chat/usage').set('Cookie', user.cookies).expect(200);
      expect(usage.body.limit).toBeNull();
    });

    it('falls back to a safe message when the AI fails', async () => {
      fakeAi.fail = true;
      const user = await signUp('fallback');
      const res = await send(user.cookies, { content: 'hello' }).expect(200);
      const text = parseSse(res.text)
        .filter((e) => e.event === 'delta')
        .map((e) => e.data.text)
        .join('');
      expect(text).toBe(FALLBACK_REPLY);
    });

    it('validates input and is for users only', async () => {
      const user = await signUp('valid');
      await send(user.cookies, { content: '   ' }).expect(400);
      await send(user.cookies, { content: 'x'.repeat(2001) }).expect(400);
      const doctor = await signUp('chatdoc', 'DOCTOR');
      await send(doctor.cookies, { content: 'hi' }).expect(403);
    });
  });
});
