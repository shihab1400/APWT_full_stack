import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { JwtService } from '@nestjs/jwt';
import { ACCESS_TOKEN_COOKIE } from '@mindease/shared';
import { AppModule } from '../src/app.module.js';
import { RemindersService } from '../src/appointments/reminders.service.js';
import { ENV, type Env } from '../src/config/env.js';
import { MailService, type OutgoingEmail } from '../src/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { configureApp } from '../src/setup.js';

const DOMAIN = '@e2e-mail.mindease.test';

/** Records emails instead of sending them. */
const outbox: OutgoingEmail[] = [];
const recorder = {
  enabled: true,
  send: (e: OutgoingEmail) => void outbox.push(e),
  deliver: async (e: OutgoingEmail) => outbox.push(e) > 0,
  link: (path: string) => new URL(path, 'http://localhost:3000').toString(),
};
const to = (address: string) => outbox.filter((e) => e.to === address);

describe('Email (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  async function signUp(label: string, role: 'USER' | 'DOCTOR' | 'ADMIN' = 'USER', paid = false) {
    const email = `${label}-${Date.now()}${DOMAIN}`;
    const user = await prisma.user.create({
      data: {
        name: `Mail ${label}`,
        email,
        passwordHash: 'x',
        role,
        doctorProfile: role === 'DOCTOR' ? { create: {} } : undefined,
        subscriptions: paid ? { create: { tier: 'PAID' } } : undefined,
      },
      include: { doctorProfile: true },
    });
    const token = await app.get(JwtService).signAsync({ sub: user.id, role, tier: 'FREE' });
    return { id: user.id, email, doctorId: user.doctorProfile?.id, cookies: [`${ACCESS_TOKEN_COOKIE}=${token}`] };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue(recorder)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get<Env>(ENV));
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(() => {
    outbox.length = 0;
  });

  afterAll(async () => {
    const mine = { endsWith: DOMAIN };
    await prisma.payment.deleteMany({
      where: { OR: [{ user: { email: mine } }, { doctor: { user: { email: mine } } }] },
    });
    await prisma.appointment.deleteMany({
      where: { OR: [{ patient: { email: mine } }, { doctor: { user: { email: mine } } }] },
    });
    await prisma.auditLog.deleteMany({ where: { actor: { email: mine } } });
    await prisma.notification.deleteMany({ where: { title: { contains: 'Mail ' } } });
    await prisma.contactMessage.deleteMany({ where: { email: mine } });
    await prisma.user.deleteMany({ where: { email: mine } });
    await app.close();
  });

  it('emails a working verification link on registration, and can resend it', async () => {
    const email = `register-${Date.now()}${DOMAIN}`;
    const res = await http()
      .post('/api/auth/register')
      .send({ name: 'Mail Reg', email, password: 'Passw0rd!', consent: true })
      .expect(201);
    const [verify] = to(email);
    expect(verify.subject).toBe('Confirm your email for MindEase Oasis');
    const link = new URL(verify.action!.url);
    expect(link.pathname).toBe('/verify-email');

    const cookies = res.headers['set-cookie'] as unknown as string[];
    await http().post('/api/auth/resend-verification').set('Cookie', cookies).expect(204);
    const resent = new URL(to(email)[1].action!.url).searchParams.get('token');
    expect(resent).not.toBe(link.searchParams.get('token'));

    // The old link stops working; the new one verifies.
    await http().get(`/api/auth/verify-email?token=${link.searchParams.get('token')}`).expect(404);
    await http().get(`/api/auth/verify-email?token=${resent}`).expect(200);
    await http().post('/api/auth/resend-verification').set('Cookie', cookies).expect(409);
  });

  it('emails a receipt for the contact form without echoing the message', async () => {
    const email = `contact-${Date.now()}${DOMAIN}`;
    const res = await http()
      .post('/api/contact')
      .send({ name: 'Visit <b>here</b>', email, message: 'Click http://spam.example now please' })
      .expect(201);
    const [receipt] = to(email);
    expect(receipt.subject).toContain(res.body.reference);
    expect(JSON.stringify(receipt)).not.toContain('spam.example');
    expect(JSON.stringify(receipt)).not.toContain('Visit');
  });

  it('emails the doctor when their profile is approved', async () => {
    const doctor = await signUp('doc', 'DOCTOR');
    const admin = await signUp('admin', 'ADMIN');
    await prisma.doctorProfile.update({
      where: { id: doctor.doctorId },
      data: { specialization: 'Psychiatry', submittedAt: new Date() },
    });
    await http().post(`/api/admin/doctors/${doctor.doctorId}/approve`).set('Cookie', admin.cookies).expect(201);
    const [approved] = to(doctor.email);
    expect(approved).toMatchObject({ subject: 'Your profile is verified', name: 'Mail doc' });
    expect(approved.action?.url).toBe('http://localhost:3000/doctor/schedule');
  });

  it('emails appointment updates to the right person, without the patient note', async () => {
    const doctor = await signUp('appt-doc', 'DOCTOR');
    const patient = await signUp('appt-pat', 'USER', true);
    await prisma.doctorProfile.update({
      where: { id: doctor.doctorId },
      data: { approvalStatus: 'APPROVED', verified: true, fee: 500 },
    });
    await prisma.availabilitySlot.createMany({
      data: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ doctorId: doctor.doctorId!, dayOfWeek, startMinute: 0, endMinute: 1440 })),
    });
    const slot = (await http().get(`/api/doctors/${doctor.doctorId}/slots`).expect(200)).body.slots[0];

    const booked = await http()
      .post('/api/appointments')
      .set('Cookie', patient.cookies)
      .send({ doctorId: doctor.doctorId, startsAt: slot.startsAt, type: 'ONLINE', note: 'private worry' })
      .expect(201);
    expect(outbox).toHaveLength(0); // nothing until it's paid
    await http()
      .post('/api/payments/test/complete')
      .set('Cookie', patient.cookies)
      .send({ reference: booked.body.reference, outcome: 'PAID' })
      .expect(200);
    expect(to(doctor.email).map((e) => e.subject)).toEqual(['New booking request from Mail appt-pat']);
    expect(to(patient.email)[0].subject).toBe('Payment received: request sent to Mail appt-doc');
    expect(JSON.stringify(outbox)).not.toContain('private worry');
    outbox.length = 0;

    await http()
      .post(`/api/doctor/appointments/${booked.body.appointment.id}/decline`)
      .set('Cookie', doctor.cookies)
      .send({ reason: 'Fully booked' })
      .expect(201);
    const subjects = to(patient.email).map((e) => e.subject);
    expect(subjects).toEqual(['A refund of 500 BDT is on its way', 'Mail appt-doc declined your request']);
    expect(to(patient.email)[1].paragraphs.join(' ')).toContain('Fully booked');
  });

  it('emails the 15-minute reminder to both sides', async () => {
    const doctor = await signUp('rem-doc', 'DOCTOR');
    const patient = await signUp('rem-pat');
    const startsAt = new Date(Date.now() + 10 * 60_000);
    await prisma.appointment.create({
      data: {
        patientId: patient.id,
        doctorId: doctor.doctorId!,
        type: 'ONLINE',
        status: 'ACCEPTED',
        startsAt,
        endsAt: new Date(startsAt.getTime() + 3_600_000),
      },
    });
    await app.get(RemindersService).tick();
    expect(to(patient.email)[0].subject).toContain('starts in 10 minutes');
    expect(to(doctor.email)[0].subject).toContain('starts in 10 minutes');
  });
});
