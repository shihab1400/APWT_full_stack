import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { JwtService } from '@nestjs/jwt';
import { ACCESS_TOKEN_COOKIE, ACCOUNT_SUSPENDED_MESSAGE } from '@mindease/shared';
import { AppModule } from '../src/app.module.js';
import { ENV, type Env } from '../src/config/env.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { configureApp } from '../src/setup.js';

const DOMAIN = '@e2e-p6.mindease.test';
const QUIZ_SLUG = `e2e-p6-${Date.now()}`;
const HOUR = 3_600_000;

interface TestUser {
  id: string;
  email: string;
  cookies: string[];
  doctorId?: string;
}

describe('Doctor tools, reviews & admin (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let doctor: TestUser;
  let otherDoctor: TestUser;
  let patient: TestUser;
  let admin: TestUser;
  const http = () => request(app.getHttpServer());

  async function signUp(label: string, role: 'USER' | 'DOCTOR' | 'ADMIN' = 'USER'): Promise<TestUser> {
    const email = `${label}-${Date.now()}${DOMAIN}`;
    const user = await prisma.user.create({
      data: {
        name: `P6 ${label}`,
        email,
        passwordHash: await bcrypt.hash('Passw0rd!', 4),
        role,
        doctorProfile:
          role === 'DOCTOR'
            ? { create: { specialization: 'Psychiatry', fee: 900, verified: true, approvalStatus: 'APPROVED' } }
            : undefined,
      },
      include: { doctorProfile: true },
    });
    const token = await app.get(JwtService).signAsync({ sub: user.id, role, tier: 'FREE' });
    return { id: user.id, email, cookies: [`${ACCESS_TOKEN_COOKIE}=${token}`], doctorId: user.doctorProfile?.id };
  }

  /** An appointment created directly in a given state, with a paid fee. */
  async function appointment(
    status: 'REQUESTED' | 'ACCEPTED' | 'COMPLETED',
    opts: { doctorId?: string; patientId?: string; hoursFromNow?: number; share?: boolean } = {},
  ) {
    const startsAt = new Date(Date.now() + (opts.hoursFromNow ?? -48) * HOUR);
    const appt = await prisma.appointment.create({
      data: {
        patientId: opts.patientId ?? patient.id,
        doctorId: opts.doctorId ?? doctor.doctorId!,
        type: 'ONLINE',
        status,
        startsAt,
        endsAt: new Date(startsAt.getTime() + HOUR),
        shareAssessments: opts.share ?? false,
      },
    });
    await prisma.payment.create({
      data: {
        reference: `MEP-E2E${Math.random().toString(16).slice(2, 14).toUpperCase()}`,
        userId: appt.patientId,
        purpose: 'APPOINTMENT',
        appointmentId: appt.id,
        doctorId: appt.doctorId,
        amount: 900,
        status: 'SUCCEEDED',
        provider: 'test',
        paidAt: startsAt,
      },
    });
    return appt;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get<Env>(ENV));
    await app.init();
    prisma = app.get(PrismaService);
    doctor = await signUp('doc', 'DOCTOR');
    otherDoctor = await signUp('otherdoc', 'DOCTOR');
    patient = await signUp('patient');
    admin = await signUp('admin', 'ADMIN');
  });

  afterAll(async () => {
    const mine = { endsWith: DOMAIN };
    const quiz = await prisma.quiz.findUnique({ where: { slug: QUIZ_SLUG } });
    if (quiz) {
      await prisma.quizAttempt.deleteMany({ where: { quizId: quiz.id } });
      await prisma.quiz.delete({ where: { id: quiz.id } });
    }
    await prisma.review.deleteMany({ where: { user: { email: mine } } });
    await prisma.payment.deleteMany({ where: { user: { email: mine } } });
    await prisma.appointment.deleteMany({ where: { patient: { email: mine } } });
    await prisma.auditLog.deleteMany({ where: { actor: { email: mine } } });
    await prisma.notification.deleteMany({ where: { title: { contains: 'P6 ' } } });
    await prisma.notification.deleteMany({ where: { type: 'REVIEW_REPORTED', body: 'Mentions another patient by name' } });
    await prisma.user.deleteMany({ where: { email: mine } });
    await app.close();
  });

  describe('rating a doctor (FR_4) and moderation (FR #23)', () => {
    let reviewId: string;

    it('lets a patient rate a completed session once, updating the public rating', async () => {
      const done = await appointment('COMPLETED');
      const upcoming = await appointment('ACCEPTED', { hoursFromNow: 48 });
      const url = (id: string) => `/api/appointments/${id}/review`;

      await http().post(url(upcoming.id)).set('Cookie', patient.cookies).send({ rating: 5 }).expect(409);
      await http().post(url(done.id)).set('Cookie', patient.cookies).send({ rating: 6 }).expect(400);
      const stranger = await signUp('stranger');
      await http().post(url(done.id)).set('Cookie', stranger.cookies).send({ rating: 5 }).expect(404);

      const res = await http()
        .post(url(done.id))
        .set('Cookie', patient.cookies)
        .send({ rating: 5, comment: 'Very helpful and understanding.' })
        .expect(201);
      reviewId = res.body.id;
      await http().post(url(done.id)).set('Cookie', patient.cookies).send({ rating: 1 }).expect(409);

      const profile = await http().get(`/api/doctors/${doctor.doctorId}`).expect(200);
      expect(profile.body).toMatchObject({ rating: 5, reviewCount: 1 });
      const mine = await http().get('/api/appointments').set('Cookie', patient.cookies).expect(200);
      expect(mine.body.find((a: { id: string }) => a.id === done.id).review).toEqual({ rating: 5 });
    });

    it('shows reviews anonymously', async () => {
      const res = await http().get(`/api/doctors/${doctor.doctorId}/reviews`).expect(200);
      expect(res.body).toEqual([
        { id: reviewId, rating: 5, comment: 'Very helpful and understanding.', createdAt: expect.any(String) },
      ]);
    });

    it('lets the doctor report a review, which admins can then hide', async () => {
      await http()
        .post(`/api/doctor/reviews/${reviewId}/report`)
        .set('Cookie', otherDoctor.cookies)
        .send({ reason: 'Not my patient' })
        .expect(404);
      const reported = await http()
        .post(`/api/doctor/reviews/${reviewId}/report`)
        .set('Cookie', doctor.cookies)
        .send({ reason: 'Mentions another patient by name' })
        .expect(201);
      expect(reported.body).toMatchObject({ status: 'FLAGGED', reportReason: 'Mentions another patient by name' });
      // Still public until an admin decides.
      expect((await http().get(`/api/doctors/${doctor.doctorId}/reviews`)).body).toHaveLength(1);

      const queue = await http().get('/api/admin/reviews?status=FLAGGED').set('Cookie', admin.cookies).expect(200);
      expect(queue.body.find((r: { id: string }) => r.id === reviewId)).toMatchObject({
        patient: { email: patient.email },
        doctor: { name: 'P6 doc' },
      });

      const url = `/api/admin/reviews/${reviewId}`;
      await http().patch(url).set('Cookie', admin.cookies).send({ status: 'HIDDEN' }).expect(400);
      await http().patch(url).set('Cookie', admin.cookies).send({ status: 'HIDDEN', reason: 'Breaks privacy rules' }).expect(200);
      expect((await http().get(`/api/doctors/${doctor.doctorId}/reviews`)).body).toHaveLength(0);
      expect((await http().get(`/api/doctors/${doctor.doctorId}`)).body).toMatchObject({ rating: null, reviewCount: 0 });
      expect(await prisma.auditLog.findFirst({ where: { action: 'REVIEW_HIDDEN', targetId: reviewId } })).toMatchObject({
        actorId: admin.id,
        reason: 'Breaks privacy rules',
      });
      await http().get('/api/admin/reviews').set('Cookie', doctor.cookies).expect(403);
    });
  });

  describe('patients and consultation notes (FR #29, #30)', () => {
    it('keeps assessment results private until the patient shares them', async () => {
      const appt = await appointment('ACCEPTED', { hoursFromNow: 24 });
      const quiz = await prisma.quiz.findUniqueOrThrow({ where: { slug: 'phq-9' } });
      await prisma.quizAttempt.create({
        data: { quizId: quiz.id, userId: patient.id, answers: [], score: 17, maxScore: 27, riskLevel: 'HIGH' },
      });

      const before = await http().get(`/api/doctor/patients/${patient.id}`).set('Cookie', doctor.cookies).expect(200);
      expect(before.body).toMatchObject({ sharesAssessments: false, assessments: [] });

      await http().patch(`/api/appointments/${appt.id}/sharing`).set('Cookie', patient.cookies).send({ share: true }).expect(200);
      const after = await http().get(`/api/doctor/patients/${patient.id}`).set('Cookie', doctor.cookies).expect(200);
      expect(after.body.sharesAssessments).toBe(true);
      expect(after.body.assessments[0]).toMatchObject({ score: 17, riskLevel: 'HIGH', quizTitle: 'Mood check (PHQ-9)' });

      const list = await http().get('/api/doctor/patients').set('Cookie', doctor.cookies).expect(200);
      expect(list.body.find((p: { id: string }) => p.id === patient.id)).toMatchObject({
        name: 'P6 patient',
        sharesAssessments: true,
        latestAssessment: { score: 17 },
      });
    });

    it("hides patients from doctors they haven't booked", async () => {
      await http().get(`/api/doctor/patients/${patient.id}`).set('Cookie', otherDoctor.cookies).expect(404);
      await http().get('/api/doctor/patients').set('Cookie', patient.cookies).expect(403);
    });

    it('saves timestamped notes only the writing doctor can see or edit', async () => {
      const requested = await appointment('REQUESTED', { hoursFromNow: 72 });
      const session = await appointment('COMPLETED', { hoursFromNow: -24 });

      await http().post(`/api/doctor/appointments/${requested.id}/notes`).set('Cookie', doctor.cookies).send({ body: 'too early' }).expect(409);
      await http().post(`/api/doctor/appointments/${session.id}/notes`).set('Cookie', otherDoctor.cookies).send({ body: 'x' }).expect(404);
      await http().post(`/api/doctor/appointments/${session.id}/notes`).set('Cookie', doctor.cookies).send({ body: '  ' }).expect(400);

      const note = await http()
        .post(`/api/doctor/appointments/${session.id}/notes`)
        .set('Cookie', doctor.cookies)
        .send({ body: 'Discussed sleep routine. Review in two weeks.' })
        .expect(201);
      expect(note.body).toMatchObject({ appointmentId: session.id, createdAt: expect.any(String) });

      await http().patch(`/api/doctor/notes/${note.body.id}`).set('Cookie', otherDoctor.cookies).send({ body: 'hijack' }).expect(404);
      const edited = await http()
        .patch(`/api/doctor/notes/${note.body.id}`)
        .set('Cookie', doctor.cookies)
        .send({ body: 'Discussed sleep routine. Follow up in two weeks.' })
        .expect(200);
      expect(Date.parse(edited.body.updatedAt)).toBeGreaterThanOrEqual(Date.parse(edited.body.createdAt));

      const detail = await http().get(`/api/doctor/patients/${patient.id}`).set('Cookie', doctor.cookies).expect(200);
      const withNote = detail.body.appointments.find((a: { id: string }) => a.id === session.id);
      expect(withNote.notes.map((n: { body: string }) => n.body)).toEqual(['Discussed sleep routine. Follow up in two weeks.']);

      // Nothing the patient can call returns notes.
      const mine = await http().get('/api/appointments').set('Cookie', patient.cookies).expect(200);
      expect(JSON.stringify(mine.body)).not.toContain('sleep routine');
      await http().get(`/api/doctor/patients/${patient.id}`).set('Cookie', patient.cookies).expect(403);
    });

    it('lists earnings from completed, paid sessions', async () => {
      const res = await http().get('/api/doctor/earnings').set('Cookie', doctor.cookies).expect(200);
      expect(res.body.items.length).toBeGreaterThanOrEqual(2);
      expect(res.body.items[0]).toMatchObject({ patientName: 'P6 patient', type: 'ONLINE', fee: 900 });
      expect(res.body.totals.earned).toBe(res.body.items.length * 900);
      const fresh = await signUp('newdoc', 'DOCTOR');
      expect((await http().get('/api/doctor/earnings').set('Cookie', fresh.cookies)).body.totals).toEqual({
        sessions: 0,
        earned: 0,
        thisMonth: 0,
      });
    });
  });

  describe('assessment management (FR_3)', () => {
    let quizId: string;
    const options = [
      { label: 'Never', score: 0 },
      { label: 'Sometimes', score: 5 },
      { label: 'Often', score: 10 },
    ];

    it('builds an assessment and refuses to publish it empty', async () => {
      const created = await http().post('/api/admin/quizzes').set('Cookie', admin.cookies).send({ slug: QUIZ_SLUG, title: 'E2E check' }).expect(201);
      quizId = created.body.id;
      expect(created.body).toMatchObject({ active: false, questions: [] });
      await http().post('/api/admin/quizzes').set('Cookie', admin.cookies).send({ slug: QUIZ_SLUG, title: 'Dupe' }).expect(409);

      const settings = { title: 'E2E check', description: '', moderateRiskScore: 10, highRiskScore: 15, active: true };
      await http().patch(`/api/admin/quizzes/${quizId}`).set('Cookie', admin.cookies).send(settings).expect(400);

      for (const text of ['Question one?', 'Question two?', 'Question three?', 'Question four?']) {
        await http().post(`/api/admin/quizzes/${quizId}/questions`).set('Cookie', admin.cookies).send({ text, options }).expect(201);
      }
      const published = await http().patch(`/api/admin/quizzes/${quizId}`).set('Cookie', admin.cookies).send(settings).expect(200);
      expect(published.body).toMatchObject({ active: true, maxScore: 40, highRiskScore: 15 });
    });

    it('applies an edited question and a new threshold to the next submission', async () => {
      const quiz = (await http().get('/api/admin/quizzes').set('Cookie', admin.cookies)).body.find((q: { id: string }) => q.id === quizId);
      const q4 = quiz.questions[3];
      await http()
        .patch(`/api/admin/quizzes/${quizId}/questions/${q4.id}`)
        .set('Cookie', admin.cookies)
        .send({ text: 'Question four, reworded?', options })
        .expect(200);

      const submit = (answers: number[]) =>
        http().post(`/api/assessment/quizzes/${quizId}/attempts`).set('Cookie', patient.cookies).send({ answers });
      // 5 + 10 = 15: high at the old threshold.
      expect((await submit([1, 2, 0, 0]).expect(201)).body.riskLevel).toBe('HIGH');

      await http()
        .patch(`/api/admin/quizzes/${quizId}`)
        .set('Cookie', admin.cookies)
        .send({ title: 'E2E check', description: '', moderateRiskScore: 10, highRiskScore: 16, active: true })
        .expect(200);
      expect((await submit([1, 2, 0, 0]).expect(201)).body.riskLevel).toBe('MODERATE');
      expect((await submit([1, 2, 1, 0]).expect(201)).body.riskLevel).toBe('HIGH');

      const live = await http().get(`/api/assessment/quizzes/${quizId}`).set('Cookie', patient.cookies).expect(200);
      expect(live.body.questions[3].text).toBe('Question four, reworded?');

      const log = await prisma.auditLog.findFirst({
        where: { action: 'QUIZ_MODIFIED', targetId: quizId },
        orderBy: { createdAt: 'desc' },
      });
      expect(log).toMatchObject({ actorId: admin.id, meta: { highRiskScore: { from: 15, to: 16 } } });
    });

    it('validates thresholds and renumbers after deleting a question', async () => {
      const base = { title: 'E2E check', description: '', active: true };
      await http().patch(`/api/admin/quizzes/${quizId}`).set('Cookie', admin.cookies).send({ ...base, moderateRiskScore: 20, highRiskScore: 10 }).expect(400);
      await http().patch(`/api/admin/quizzes/${quizId}`).set('Cookie', admin.cookies).send({ ...base, moderateRiskScore: 10, highRiskScore: 99 }).expect(400);

      const quiz = (await http().get('/api/admin/quizzes').set('Cookie', admin.cookies)).body.find((q: { id: string }) => q.id === quizId);
      const res = await http().delete(`/api/admin/quizzes/${quizId}/questions/${quiz.questions[1].id}`).set('Cookie', admin.cookies).expect(200);
      expect(res.body.questions.map((q: { order: number; text: string }) => [q.order, q.text])).toEqual([
        [1, 'Question one?'],
        [2, 'Question three?'],
        [3, 'Question four, reworded?'],
      ]);
      await http().get('/api/admin/quizzes').set('Cookie', doctor.cookies).expect(403);
    });
  });

  describe('risk alerts, audit log and users', () => {
    it('lists risk alerts with whether the user booked a doctor, and records follow-up (FR #20)', async () => {
      const alert = await prisma.riskAlert.create({
        data: { userId: patient.id, source: 'CHAT', severity: 'HIGH', detail: 'Crisis language detected in AI chat', bookedDoctor: true },
      });
      const list = await http().get('/api/admin/risk-alerts?open=true').set('Cookie', admin.cookies).expect(200);
      expect(list.body.items.find((a: { id: string }) => a.id === alert.id)).toMatchObject({
        severity: 'HIGH',
        bookedDoctor: true,
        followedUp: false,
        user: { email: patient.email },
      });

      const url = `/api/admin/risk-alerts/${alert.id}/follow-up`;
      await http().post(url).set('Cookie', admin.cookies).send({ note: '' }).expect(400);
      await http().post(url).set('Cookie', admin.cookies).send({ note: 'Called the user; booked with doctor' }).expect(201);
      await http().post(url).set('Cookie', admin.cookies).send({ note: 'again' }).expect(400);

      const open = await http().get('/api/admin/risk-alerts?open=true').set('Cookie', admin.cookies).expect(200);
      expect(open.body.items.some((a: { id: string }) => a.id === alert.id)).toBe(false);
      await http().get('/api/admin/risk-alerts').set('Cookie', doctor.cookies).expect(403);
    });

    it('shows the audit log with admin and time, filterable by action (FR #24)', async () => {
      const res = await http().get(`/api/admin/audit-logs?action=QUIZ_MODIFIED&actorId=${admin.id}`).set('Cookie', admin.cookies).expect(200);
      expect(res.body.items.length).toBeGreaterThan(0);
      expect(res.body.items.every((i: { action: string; actor: { id: string } }) => i.action === 'QUIZ_MODIFIED' && i.actor.id === admin.id)).toBe(true);
      expect(res.body.items[0]).toMatchObject({ actor: { email: admin.email }, createdAt: expect.any(String) });
      expect(res.body.actions).toEqual(expect.arrayContaining(['QUIZ_MODIFIED', 'REVIEW_HIDDEN', 'RISK_ALERT_FOLLOWED_UP']));
      await http().get('/api/admin/audit-logs').set('Cookie', patient.cookies).expect(403);
    });

    it('searches users and suspends one with a logged reason (FR_2)', async () => {
      const target = await signUp('suspend-me');
      const found = await http().get(`/api/admin/users?q=suspend-me`).set('Cookie', admin.cookies).expect(200);
      expect(found.body.map((u: { id: string }) => u.id)).toEqual([target.id]);
      const doctors = await http().get('/api/admin/users?role=DOCTOR&q=e2e-p6').set('Cookie', admin.cookies).expect(200);
      expect(doctors.body.every((u: { role: string }) => u.role === 'DOCTOR')).toBe(true);

      await http()
        .patch(`/api/admin/users/${target.id}/status`)
        .set('Cookie', admin.cookies)
        .send({ status: 'DEACTIVATED', reason: 'Harassment' })
        .expect(200);
      const login = await http().post('/api/auth/login').send({ email: target.email, password: 'Passw0rd!' }).expect(403);
      expect(login.body.message).toBe(ACCOUNT_SUSPENDED_MESSAGE);
      const log = await http().get('/api/admin/audit-logs?action=USER_DEACTIVATED').set('Cookie', admin.cookies).expect(200);
      expect(log.body.items.find((i: { targetId: string }) => i.targetId === target.id)).toMatchObject({
        reason: 'Harassment',
        actor: { id: admin.id },
      });
    });
  });
});
