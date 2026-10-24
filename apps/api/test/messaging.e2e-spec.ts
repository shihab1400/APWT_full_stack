import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { JwtService } from '@nestjs/jwt';
import { ACCESS_TOKEN_COOKIE } from '@mindease/shared';
import { AppModule } from '../src/app.module.js';
import { ENV, type Env } from '../src/config/env.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { configureApp } from '../src/setup.js';

const DOMAIN = '@e2e-p7.mindease.test';
const MIN = 60_000;

interface TestUser {
  id: string;
  cookies: string[];
  doctorId?: string;
}

describe('Consultation messaging (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let doctor: TestUser;
  let patient: TestUser;
  let stranger: TestUser;
  let admin: TestUser;
  let live: string;
  let upcoming: string;
  let finished: string;
  let offline: string;
  const http = () => request(app.getHttpServer());

  async function signUp(label: string, role: 'USER' | 'DOCTOR' | 'ADMIN' = 'USER'): Promise<TestUser> {
    const user = await prisma.user.create({
      data: {
        name: `P7 ${label}`,
        email: `${label}-${Date.now()}${DOMAIN}`,
        passwordHash: 'x',
        role,
        doctorProfile:
          role === 'DOCTOR' ? { create: { fee: 500, verified: true, approvalStatus: 'APPROVED' } } : undefined,
      },
      include: { doctorProfile: true },
    });
    const token = await app.get(JwtService).signAsync({ sub: user.id, role, tier: 'PAID' });
    return { id: user.id, cookies: [`${ACCESS_TOKEN_COOKIE}=${token}`], doctorId: user.doctorProfile?.id };
  }

  async function appointment(minutesFromNow: number, opts: { status?: 'ACCEPTED' | 'COMPLETED' | 'REQUESTED'; type?: 'ONLINE' | 'OFFLINE' } = {}) {
    const startsAt = new Date(Date.now() + minutesFromNow * MIN);
    const a = await prisma.appointment.create({
      data: {
        patientId: patient.id,
        doctorId: doctor.doctorId!,
        type: opts.type ?? 'ONLINE',
        status: opts.status ?? 'ACCEPTED',
        startsAt,
        endsAt: new Date(startsAt.getTime() + 60 * MIN),
      },
    });
    return a.id;
  }

  const send = (who: TestUser, id: string, body: string) =>
    http().post(`/api/consultations/${id}/messages`).set('Cookie', who.cookies).send({ body });

  /** Opens the user's live stream and collects its text. */
  async function openStream(who: TestUser) {
    const { port } = (app.getHttpServer() as unknown as Server).address() as AddressInfo;
    const abort = new AbortController();
    const res = await fetch(`http://127.0.0.1:${port}/api/notifications/stream`, {
      headers: { Cookie: who.cookies[0] },
      signal: abort.signal,
    });
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    let text = '';
    const waitFor = async (needle: string) => {
      while (!text.includes(needle)) text += (await reader.read()).value ?? '';
      return text;
    };
    await waitFor('event: ready');
    return { waitFor, close: () => abort.abort() };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get<Env>(ENV));
    await app.listen(0);
    prisma = app.get(PrismaService);
    doctor = await signUp('doc', 'DOCTOR');
    patient = await signUp('patient');
    stranger = await signUp('stranger');
    admin = await signUp('admin', 'ADMIN');
    live = await appointment(5); // chat is open
    upcoming = await appointment(2 * 24 * 60);
    finished = await appointment(-3 * 60, { status: 'COMPLETED' });
    offline = await appointment(5, { type: 'OFFLINE' });
    await appointment(3 * 24 * 60, { status: 'REQUESTED' });
  });

  afterAll(async () => {
    const mine = { endsWith: DOMAIN };
    await prisma.appointment.deleteMany({ where: { patient: { email: mine } } });
    await prisma.user.deleteMany({ where: { email: mine } });
    await app.close();
  });

  it('lists confirmed and completed online sessions for both sides', async () => {
    const forPatient = await http().get('/api/consultations').set('Cookie', patient.cookies).expect(200);
    expect(forPatient.body.map((c: { appointmentId: string; window: string }) => [c.appointmentId, c.window])).toEqual([
      [live, 'OPEN'],
      [upcoming, 'UPCOMING'],
      [finished, 'CLOSED'],
    ]);
    expect(forPatient.body[0]).toMatchObject({ myRole: 'PATIENT', counterpart: { id: doctor.id, name: 'P7 doc' } });

    const forDoctor = await http().get('/api/consultations').set('Cookie', doctor.cookies).expect(200);
    expect(forDoctor.body[0]).toMatchObject({ appointmentId: live, myRole: 'DOCTOR', counterpart: { name: 'P7 patient' } });
  });

  it('delivers messages live and tracks unread and read receipts', async () => {
    const doctorStream = await openStream(doctor);
    const patientStream = await openStream(patient);

    const sent = await send(patient, live, 'Hello doctor, I am here.').expect(201);
    expect(sent.body).toMatchObject({ senderId: patient.id, flagged: false, readAt: null });
    expect(await doctorStream.waitFor('event: message')).toContain('Hello doctor, I am here.');

    expect((await http().get('/api/consultations/unread').set('Cookie', doctor.cookies)).body.total).toBe(1);
    const list = await http().get('/api/consultations').set('Cookie', doctor.cookies);
    expect(list.body[0]).toMatchObject({ unreadCount: 1, lastMessage: { body: 'Hello doctor, I am here.', mine: false } });

    const thread = await http().get(`/api/consultations/${live}`).set('Cookie', doctor.cookies).expect(200);
    expect(thread.body.messages.map((m: { body: string }) => m.body)).toEqual(['Hello doctor, I am here.']);
    expect((await http().get('/api/consultations/unread').set('Cookie', doctor.cookies)).body.total).toBe(0);
    // "event: read\n", not to be confused with "event: ready".
    expect(await patientStream.waitFor('event: read\n')).toContain(live);

    await send(doctor, live, 'Hi, good to meet you. How are you feeling today?').expect(201);
    await patientStream.waitFor('How are you feeling today?');
    await http().post(`/api/consultations/${live}/read`).set('Cookie', patient.cookies).expect(204);
    expect((await http().get('/api/consultations/unread').set('Cookie', patient.cookies)).body.total).toBe(0);

    doctorStream.close();
    patientStream.close();
  });

  it('only accepts messages while the session chat is open', async () => {
    const early = await send(patient, upcoming, 'Can we talk now?').expect(409);
    expect(early.body.message).toContain('The chat opens');
    const late = await send(patient, finished, 'One more thing').expect(409);
    expect(late.body.message).toContain('read-only');
    await http().get(`/api/consultations/${finished}`).set('Cookie', patient.cookies).expect(200);
    await send(patient, live, '   ').expect(400);
    await send(patient, live, 'x'.repeat(2001)).expect(400);
  });

  it('keeps chats private to the two participants', async () => {
    await http().get(`/api/consultations/${live}`).set('Cookie', stranger.cookies).expect(404);
    await send(stranger, live, 'hi').expect(404);
    await http().get(`/api/consultations/${live}`).set('Cookie', admin.cookies).expect(403);
    // In-person sessions have no chat.
    await http().get(`/api/consultations/${offline}`).set('Cookie', patient.cookies).expect(404);
  });

  it("flags a patient's crisis message, raises an alert and keeps the doctor informed", async () => {
    const res = await send(patient, live, 'Sometimes I feel like I want to die').expect(201);
    expect(res.body.flagged).toBe(true);
    expect(await prisma.riskAlert.findFirst({ where: { sourceId: res.body.id } })).toMatchObject({
      userId: patient.id,
      source: 'CONSULTATION',
      severity: 'HIGH',
    });
    // The doctor quoting the same words is not flagged.
    const quote = await send(doctor, live, 'You said you want to die. Thank you for telling me.').expect(201);
    expect(quote.body.flagged).toBe(false);

    const thread = await http().get(`/api/consultations/${live}`).set('Cookie', doctor.cookies).expect(200);
    expect(thread.body.messages.find((m: { id: string }) => m.id === res.body.id).flagged).toBe(true);
  });
});
