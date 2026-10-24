import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { JwtService } from '@nestjs/jwt';
import { ACCESS_TOKEN_COOKIE, SLOT_UNAVAILABLE_MESSAGE } from '@mindease/shared';
import { AppModule } from '../src/app.module.js';
import { EXPIRED_REASON, RemindersService } from '../src/appointments/reminders.service.js';
import { DAY_MS, atDhakaMinute, dhakaDay, dhakaWeekday } from '../src/common/dhaka-time.js';
import { ENV, type Env } from '../src/config/env.js';
import { LicenseStorage } from '../src/doctors/license-storage.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { configureApp } from '../src/setup.js';

const DOMAIN = '@e2e-p4.mindease.test';
const NAME = 'E2E';
const PDF = Buffer.from('%PDF-1.4\n% test licence\n');
const MON = 1;
const WED = 3;

/** The next `weekday` at least two days ahead, at `minute` past midnight Dhaka time. */
function nextDhaka(weekday: number, minute: number): Date {
  const today = dhakaDay().start.getTime();
  for (let i = 2; i < 9; i++) {
    const day = new Date(today + i * DAY_MS);
    if (dhakaWeekday(day) === weekday) return atDhakaMinute(day, minute);
  }
  throw new Error('unreachable');
}

interface TestUser {
  id: string;
  cookies: string[];
  doctorId?: string;
}

describe('Doctors, scheduling & booking (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  async function signUp(
    label: string,
    role: 'USER' | 'DOCTOR' | 'ADMIN' = 'USER',
    opts: { paid?: boolean; approved?: boolean; clinicAddress?: string } = {},
  ): Promise<TestUser> {
    const user = await prisma.user.create({
      data: {
        name: `${NAME} ${label}`,
        email: `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}${DOMAIN}`,
        passwordHash: 'x',
        role,
        doctorProfile:
          role === 'DOCTOR'
            ? {
                create: opts.approved
                  ? {
                      specialization: 'Psychiatry',
                      fee: 700,
                      verified: true,
                      approvalStatus: 'APPROVED',
                      clinicAddress: opts.clinicAddress,
                    }
                  : {},
              }
            : undefined,
        subscriptions: opts.paid ? { create: { tier: 'PAID' } } : undefined,
      },
      include: { doctorProfile: true },
    });
    const token = await app
      .get(JwtService)
      .signAsync({ sub: user.id, role, tier: opts.paid ? 'PAID' : 'FREE' });
    return { id: user.id, cookies: [`${ACCESS_TOKEN_COOKIE}=${token}`], doctorId: user.doctorProfile?.id };
  }

  /** Finishes a test-checkout payment as paid. */
  const pay = (who: TestUser, reference: string) =>
    http()
      .post('/api/payments/test/complete')
      .set('Cookie', who.cookies)
      .send({ reference, outcome: 'PAID' })
      .expect(200);

  const notificationsOf = (userId: string) =>
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get<Env>(ENV));
    await app.listen(0);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    const mine = { endsWith: DOMAIN };
    const files = await prisma.doctorProfile.findMany({
      where: { user: { email: mine }, licenseFile: { not: null } },
      select: { licenseFile: true },
    });
    for (const f of files) await app.get(LicenseStorage).remove(f.licenseFile!);
    await prisma.payment.deleteMany({
      where: { OR: [{ user: { email: mine } }, { doctor: { user: { email: mine } } }] },
    });
    await prisma.appointment.deleteMany({
      where: { OR: [{ patient: { email: mine } }, { doctor: { user: { email: mine } } }] },
    });
    await prisma.auditLog.deleteMany({ where: { actor: { email: mine } } });
    // Submissions also notify the seeded admin.
    await prisma.notification.deleteMany({ where: { title: { contains: `${NAME} ` } } });
    await prisma.user.deleteMany({ where: { email: mine } });
    await app.close();
  });

  describe('doctor registration and approval (FR_9, FR_1)', () => {
    let doctor: TestUser;
    let admin: TestUser;
    const profile = {
      specialization: 'Psychiatry',
      qualifications: 'MBBS, FCPS',
      experienceYears: 5,
      fee: 900,
      bio: 'Helps adults with anxiety and low mood using practical, structured plans.',
    };

    beforeAll(async () => {
      doctor = await signUp('rahat', 'DOCTOR');
      admin = await signUp('admin', 'ADMIN');
    });

    it('starts incomplete and lists what is missing', async () => {
      const res = await http().get('/api/doctor/profile').set('Cookie', doctor.cookies).expect(200);
      expect(res.body).toMatchObject({ status: 'INCOMPLETE', hasLicense: false });
      expect(res.body.missing).toEqual(expect.arrayContaining(['specialization', 'licence']));
      await http().post('/api/doctor/profile/submit').set('Cookie', doctor.cookies).expect(400);
    });

    it('validates and saves the profile', async () => {
      await http()
        .put('/api/doctor/profile')
        .set('Cookie', doctor.cookies)
        .send({ ...profile, fee: 5 })
        .expect(400);
      const res = await http()
        .put('/api/doctor/profile')
        .set('Cookie', doctor.cookies)
        .send(profile)
        .expect(200);
      expect(res.body).toMatchObject({ ...profile, clinicAddress: null, missing: ['licence'] });
    });

    it('accepts only real PDF or image licences', async () => {
      await http()
        .post('/api/doctor/profile/license')
        .set('Cookie', doctor.cookies)
        .attach('file', Buffer.from('not really a pdf'), { filename: 'licence.pdf', contentType: 'application/pdf' })
        .expect(415);
      const res = await http()
        .post('/api/doctor/profile/license')
        .set('Cookie', doctor.cookies)
        .attach('file', PDF, { filename: 'licence.pdf', contentType: 'application/pdf' })
        .expect(201);
      expect(res.body).toMatchObject({ hasLicense: true, licenseMimeType: 'application/pdf', missing: [] });

      const file = await http().get('/api/doctor/profile/license').set('Cookie', doctor.cookies).expect(200);
      expect(file.headers['content-type']).toBe('application/pdf');
    });

    it('submits for review and stays hidden from the public directory', async () => {
      const res = await http().post('/api/doctor/profile/submit').set('Cookie', doctor.cookies).expect(201);
      expect(res.body.status).toBe('SUBMITTED');
      await http().get(`/api/doctors/${doctor.doctorId}`).expect(404);

      const list = await http().get('/api/admin/doctors?status=SUBMITTED').set('Cookie', admin.cookies).expect(200);
      expect(list.body.map((d: { id: string }) => d.id)).toContain(doctor.doctorId);
      expect((await notificationsOf(admin.id)).map((n) => n.type)).toContain('DOCTOR_SUBMITTED');

      const licence = await http()
        .get(`/api/admin/doctors/${doctor.doctorId}/license`)
        .set('Cookie', admin.cookies)
        .expect(200);
      expect(licence.headers['content-type']).toBe('application/pdf');
    });

    it('keeps approval and licences admin-only', async () => {
      await http().get('/api/admin/doctors').set('Cookie', doctor.cookies).expect(403);
      await http().post(`/api/admin/doctors/${doctor.doctorId}/approve`).set('Cookie', doctor.cookies).expect(403);
      const user = await signUp('nosy');
      await http().get(`/api/admin/doctors/${doctor.doctorId}/license`).set('Cookie', user.cookies).expect(403);
      await http().get('/api/doctor/profile').set('Cookie', user.cookies).expect(403);
    });

    it('sends a rejected profile back with the reason', async () => {
      const url = `/api/admin/doctors/${doctor.doctorId}/reject`;
      await http().post(url).set('Cookie', admin.cookies).send({ reason: '' }).expect(400);
      await http()
        .post(url)
        .set('Cookie', admin.cookies)
        .send({ reason: 'Licence image is unreadable' })
        .expect(201);

      const res = await http().get('/api/doctor/profile').set('Cookie', doctor.cookies).expect(200);
      expect(res.body).toMatchObject({ status: 'REJECTED', rejectReason: 'Licence image is unreadable' });
      const rejected = (await notificationsOf(doctor.id)).find((n) => n.type === 'DOCTOR_REJECTED');
      expect(rejected?.body).toBe('Licence image is unreadable');
      expect(
        await prisma.auditLog.findFirst({ where: { action: 'DOCTOR_REJECTED', targetId: doctor.doctorId } }),
      ).toMatchObject({ actorId: admin.id, reason: 'Licence image is unreadable' });
    });

    it('approves a resubmitted profile, making it public and bookable', async () => {
      await http()
        .post('/api/doctor/profile/license')
        .set('Cookie', doctor.cookies)
        .attach('file', PDF, { filename: 'clear.pdf', contentType: 'application/pdf' })
        .expect(201);
      await http().post('/api/doctor/profile/submit').set('Cookie', doctor.cookies).expect(201);
      await http().post(`/api/admin/doctors/${doctor.doctorId}/approve`).set('Cookie', admin.cookies).expect(201);

      const me = await http().get('/api/doctor/profile').set('Cookie', doctor.cookies).expect(200);
      expect(me.body.status).toBe('APPROVED');
      const pub = await http().get(`/api/doctors/${doctor.doctorId}`).expect(200);
      expect(pub.body).toMatchObject({ name: `${NAME} rahat`, fee: 900 });
      expect(pub.body).not.toHaveProperty('email');
      expect((await notificationsOf(doctor.id)).map((n) => n.type)).toContain('DOCTOR_APPROVED');
      expect(
        await prisma.auditLog.findFirst({ where: { action: 'DOCTOR_APPROVED', targetId: doctor.doctorId } }),
      ).toMatchObject({ actorId: admin.id });

      await http().post(`/api/admin/doctors/${doctor.doctorId}/approve`).set('Cookie', admin.cookies).expect(409);
      await http()
        .post('/api/doctor/profile/license')
        .set('Cookie', doctor.cookies)
        .attach('file', PDF, { filename: 'new.pdf', contentType: 'application/pdf' })
        .expect(409);
    });
  });

  describe('availability and booking (FR_10, FR_8, FR_11)', () => {
    let doctor: TestUser;
    let patient: TestUser;
    const monday11 = nextDhaka(MON, 11 * 60);
    const wednesday15 = nextDhaka(WED, 15 * 60);

    const book = (who: TestUser, startsAt: Date, type = 'ONLINE', doctorId = doctor.doctorId) =>
      http()
        .post('/api/appointments')
        .set('Cookie', who.cookies)
        .send({ doctorId, startsAt: startsAt.toISOString(), type, note: 'Trouble sleeping' });
    /** Books and completes the test checkout; returns the appointment id. */
    const bookAndPay = async (who: TestUser, startsAt: Date) => {
      const res = await book(who, startsAt).expect(201);
      await pay(who, res.body.reference);
      return res.body.appointment.id as string;
    };
    const openSlots = async () =>
      (await http().get(`/api/doctors/${doctor.doctorId}/slots`).expect(200)).body.slots.map(
        (s: { startsAt: string }) => s.startsAt,
      );

    beforeAll(async () => {
      doctor = await signUp('schedule', 'DOCTOR', { approved: true });
      patient = await signUp('patient', 'USER', { paid: true });
    });

    it('validates weekly hours', async () => {
      await http()
        .put('/api/doctor/schedule/weekly')
        .set('Cookie', doctor.cookies)
        .send({
          windows: [
            { dayOfWeek: MON, startMinute: 600, endMinute: 720 },
            { dayOfWeek: MON, startMinute: 660, endMinute: 780 },
          ],
        })
        .expect(400);
      await http()
        .put('/api/doctor/schedule/weekly')
        .set('Cookie', doctor.cookies)
        .send({ windows: [{ dayOfWeek: MON, startMinute: 605, endMinute: 720 }] })
        .expect(400);
    });

    it('opens Monday 10–12 and blocks Wednesday 2–4 PM', async () => {
      await http()
        .put('/api/doctor/schedule/weekly')
        .set('Cookie', doctor.cookies)
        .send({
          windows: [
            { dayOfWeek: MON, startMinute: 600, endMinute: 720 },
            { dayOfWeek: WED, startMinute: 840, endMinute: 960 },
          ],
        })
        .expect(200);
      const blockStart = nextDhaka(WED, 14 * 60);
      const res = await http()
        .post('/api/doctor/schedule/blocks')
        .set('Cookie', doctor.cookies)
        .send({
          startsAt: blockStart.toISOString(),
          endsAt: new Date(blockStart.getTime() + 2 * 3_600_000).toISOString(),
          reason: 'Hospital rounds',
        })
        .expect(201);
      const wed = res.body.slots.find((s: { startsAt: string }) => s.startsAt === wednesday15.toISOString());
      expect(wed).toMatchObject({ state: 'BLOCKED' });

      const slots = await openSlots();
      expect(slots).toContain(monday11.toISOString());
      expect(slots).not.toContain(wednesday15.toISOString());
    });

    it('requires Premium to book', async () => {
      const free = await signUp('free');
      const res = await book(free, monday11).expect(403);
      expect(res.body.code).toBe('PREMIUM_REQUIRED');
    });

    it('rejects blocked and out-of-hours slots with a clear error', async () => {
      const blocked = await book(patient, wednesday15).expect(409);
      expect(blocked.body).toMatchObject({ code: 'SLOT_UNAVAILABLE', message: SLOT_UNAVAILABLE_MESSAGE });
      await book(patient, nextDhaka(MON, 9 * 60)).expect(409);
      await book(patient, new Date(monday11.getTime() + 30 * 60_000)).expect(409);
      await book(patient, monday11, 'OFFLINE').expect(400); // no clinic address
    });

    it('books an open slot, locks it and notifies both sides', async () => {
      const res = await book(patient, monday11).expect(201);
      expect(res.body).toMatchObject({ amount: 700, provider: 'test' });
      expect(res.body.appointment).toMatchObject({
        status: 'PENDING_PAYMENT',
        type: 'ONLINE',
        startsAt: monday11.toISOString(),
        patientNote: 'Trouble sleeping',
        patient: { name: `${NAME} patient` },
      });
      // Held while the patient pays.
      expect(await openSlots()).not.toContain(monday11.toISOString());
      const other = await signUp('other', 'USER', { paid: true });
      await book(other, monday11).expect(409);
      expect((await notificationsOf(doctor.id)).map((n) => n.type)).not.toContain('APPOINTMENT_REQUESTED');

      await pay(patient, res.body.reference);
      expect((await notificationsOf(doctor.id)).map((n) => n.type)).toContain('APPOINTMENT_REQUESTED');
      expect((await notificationsOf(patient.id)).map((n) => n.type)).toContain('PAYMENT_RECEIVED');
    });

    it('lets only one of two simultaneous bookings win', async () => {
      const a = await signUp('race-a', 'USER', { paid: true });
      const b = await signUp('race-b', 'USER', { paid: true });
      const slot = new Date(monday11.getTime() - 3_600_000); // Monday 10:00
      const results = await Promise.all([book(a, slot), book(b, slot)]);
      expect(results.map((r) => r.status).sort((x, y) => x - y)).toEqual([201, 409]);
    });

    it('shows the doctor the request and lets them decline with a reason', async () => {
      const list = await http().get('/api/doctor/appointments').set('Cookie', doctor.cookies).expect(200);
      const request_ = list.body.find((a: { startsAt: string }) => a.startsAt === monday11.toISOString());
      expect(request_).toMatchObject({ status: 'REQUESTED', type: 'ONLINE', patient: { name: `${NAME} patient` } });

      const url = `/api/doctor/appointments/${request_.id}/decline`;
      await http().post(url).set('Cookie', doctor.cookies).send({ reason: '' }).expect(400);
      const res = await http()
        .post(url)
        .set('Cookie', doctor.cookies)
        .send({ reason: 'Unavailable due to emergency' })
        .expect(201);
      expect(res.body).toMatchObject({ status: 'DECLINED', declineReason: 'Unavailable due to emergency' });

      const declined = (await notificationsOf(patient.id)).find((n) => n.type === 'APPOINTMENT_DECLINED');
      expect(declined?.body).toContain('Unavailable due to emergency');
      expect(await openSlots()).toContain(monday11.toISOString());
      await http().post(url).set('Cookie', doctor.cookies).send({ reason: 'again' }).expect(409);
    });

    it('confirms a request, then the patient can cancel it', async () => {
      const id = await bookAndPay(patient, monday11);

      const stranger = await signUp('stranger', 'DOCTOR', { approved: true });
      await http().post(`/api/doctor/appointments/${id}/accept`).set('Cookie', stranger.cookies).expect(404);

      const accepted = await http()
        .post(`/api/doctor/appointments/${id}/accept`)
        .set('Cookie', doctor.cookies)
        .expect(201);
      expect(accepted.body.status).toBe('ACCEPTED');
      expect((await notificationsOf(patient.id)).map((n) => n.type)).toContain('APPOINTMENT_ACCEPTED');

      const mine = await http().get('/api/appointments').set('Cookie', patient.cookies).expect(200);
      expect(mine.body.find((a: { id: string }) => a.id === id)).toMatchObject({ status: 'ACCEPTED' });

      // A block cannot hide a confirmed appointment.
      await http()
        .post('/api/doctor/schedule/blocks')
        .set('Cookie', doctor.cookies)
        .send({ startsAt: monday11.toISOString(), endsAt: new Date(monday11.getTime() + 3_600_000).toISOString() })
        .expect(409);
      await http().post(`/api/doctor/appointments/${id}/cancel`).set('Cookie', doctor.cookies).send({}).expect(400);

      const cancelled = await http()
        .post(`/api/appointments/${id}/cancel`)
        .set('Cookie', patient.cookies)
        .send({ reason: 'Feeling better' })
        .expect(201);
      expect(cancelled.body).toMatchObject({ status: 'CANCELLED', cancelledBy: 'PATIENT' });
      expect((await notificationsOf(doctor.id)).map((n) => n.type)).toContain('APPOINTMENT_CANCELLED');
    });

    it('records that a high-risk user booked a doctor', async () => {
      const user = await signUp('risky', 'USER', { paid: true });
      const alert = await prisma.riskAlert.create({
        data: { userId: user.id, source: 'QUIZ', severity: 'HIGH' },
      });
      await bookAndPay(user, new Date(monday11.getTime() + 7 * DAY_MS));
      expect(await prisma.riskAlert.findUnique({ where: { id: alert.id } })).toMatchObject({ bookedDoctor: true });
    });

    it('keeps booking for users and the schedule for doctors', async () => {
      await book(doctor, monday11).expect(403);
      await http().get('/api/doctor/schedule').set('Cookie', patient.cookies).expect(403);
      await http().get('/api/appointments').expect(401);
    });
  });

  describe('reminders and expiry', () => {
    it('reminds both sides 15 minutes before, once', async () => {
      const doctor = await signUp('remind-doc', 'DOCTOR', { approved: true });
      const patient = await signUp('remind-pat', 'USER', { paid: true });
      const now = new Date();
      const startsAt = new Date(now.getTime() + 10 * 60_000);
      await prisma.appointment.create({
        data: {
          patientId: patient.id,
          doctorId: doctor.doctorId!,
          type: 'OFFLINE',
          status: 'ACCEPTED',
          startsAt,
          endsAt: new Date(startsAt.getTime() + 3_600_000),
        },
      });

      const reminders = app.get(RemindersService);
      expect((await reminders.tick(now)).reminded).toBeGreaterThanOrEqual(1);
      await reminders.tick(now);

      const forPatient = (await notificationsOf(patient.id)).filter((n) => n.type === 'APPOINTMENT_REMINDER');
      const forDoctor = (await notificationsOf(doctor.id)).filter((n) => n.type === 'APPOINTMENT_REMINDER');
      expect(forPatient).toHaveLength(1);
      expect(forDoctor).toHaveLength(1);
      expect(forPatient[0].title).toContain('starts in 10 minutes');
    });

    it('closes requests the doctor never answered', async () => {
      const doctor = await signUp('slow-doc', 'DOCTOR', { approved: true });
      const patient = await signUp('waiting', 'USER', { paid: true });
      const startsAt = new Date(Date.now() - 60_000);
      const appt = await prisma.appointment.create({
        data: {
          patientId: patient.id,
          doctorId: doctor.doctorId!,
          type: 'ONLINE',
          status: 'REQUESTED',
          startsAt,
          endsAt: new Date(startsAt.getTime() + 3_600_000),
        },
      });
      await app.get(RemindersService).tick();
      expect(await prisma.appointment.findUnique({ where: { id: appt.id } })).toMatchObject({
        status: 'CANCELLED',
        cancelReason: EXPIRED_REASON,
      });
      const mine = await http().get('/api/appointments').set('Cookie', patient.cookies).expect(200);
      expect(mine.body[0]).toMatchObject({ cancelledBy: 'SYSTEM' });
      expect((await notificationsOf(patient.id)).map((n) => n.type)).toContain('APPOINTMENT_EXPIRED');
    });
  });

  describe('admin appointment view (FR #21)', () => {
    it('lists and filters all appointments', async () => {
      const admin = await signUp('appt-admin', 'ADMIN');
      const all = await http().get('/api/admin/appointments').set('Cookie', admin.cookies).expect(200);
      expect(all.body.length).toBeGreaterThan(0);
      const offline = await http()
        .get('/api/admin/appointments?type=OFFLINE&status=ACCEPTED')
        .set('Cookie', admin.cookies)
        .expect(200);
      expect(offline.body.every((a: { type: string; status: string }) => a.type === 'OFFLINE' && a.status === 'ACCEPTED')).toBe(true);
      await http().get('/api/admin/appointments?status=NOPE').set('Cookie', admin.cookies).expect(400);
      const user = await signUp('appt-user');
      await http().get('/api/admin/appointments').set('Cookie', user.cookies).expect(403);
    });
  });

  describe('notifications', () => {
    it('lists, counts and marks notifications read, privately', async () => {
      const user = await signUp('inbox');
      const other = await signUp('inbox-other');
      await prisma.notification.createMany({
        data: [
          { userId: user.id, type: 'APPOINTMENT_ACCEPTED', title: 'one' },
          { userId: user.id, type: 'APPOINTMENT_ACCEPTED', title: 'two' },
        ],
      });
      const list = await http().get('/api/notifications').set('Cookie', user.cookies).expect(200);
      expect(list.body.unreadCount).toBe(2);

      const id = list.body.items[0].id;
      await http().patch(`/api/notifications/${id}/read`).set('Cookie', other.cookies).expect(404);
      await http().patch(`/api/notifications/${id}/read`).set('Cookie', user.cookies).expect(204);
      expect((await http().get('/api/notifications').set('Cookie', user.cookies)).body.unreadCount).toBe(1);
      await http().post('/api/notifications/read-all').set('Cookie', user.cookies).expect(204);
      expect((await http().get('/api/notifications').set('Cookie', user.cookies)).body.unreadCount).toBe(0);
    });

    it('pushes new notifications over the stream in real time', async () => {
      const doctor = await signUp('live-doc', 'DOCTOR', { approved: true });
      const patient = await signUp('live-pat', 'USER', { paid: true });
      await http()
        .put('/api/doctor/schedule/weekly')
        .set('Cookie', doctor.cookies)
        .send({ windows: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, startMinute: 0, endMinute: 1440 })) })
        .expect(200);

      const { port } = (app.getHttpServer() as unknown as Server).address() as AddressInfo;
      const abort = new AbortController();
      const res = await fetch(`http://127.0.0.1:${port}/api/notifications/stream`, {
        headers: { Cookie: doctor.cookies[0] },
        signal: abort.signal,
      });
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();

      let text = '';
      const waitFor = async (needle: string) => {
        while (!text.includes(needle)) text += (await reader.read()).value ?? '';
      };
      await waitFor('event: ready');

      const slot = (await http().get(`/api/doctors/${doctor.doctorId}/slots`).expect(200)).body.slots[0];
      const booked = await http()
        .post('/api/appointments')
        .set('Cookie', patient.cookies)
        .send({ doctorId: doctor.doctorId, startsAt: slot.startsAt, type: 'ONLINE' })
        .expect(201);
      await pay(patient, booked.body.reference);
      await waitFor('event: notification');
      expect(text).toContain(`New booking request from ${NAME} live-pat`);
      abort.abort();
    });
  });
});
