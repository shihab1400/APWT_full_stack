import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { JwtService } from '@nestjs/jwt';
import { vi } from 'vitest';
import { ACCESS_TOKEN_COOKIE, PAID_PLAN_MONTHLY_PRICE, PAYMENT_HOLD_MINUTES, SUBSCRIPTION_DAYS } from '@mindease/shared';
import { AppModule } from '../src/app.module.js';
import { RemindersService } from '../src/appointments/reminders.service.js';
import { DAY_MS } from '../src/common/dhaka-time.js';
import { ENV, type Env } from '../src/config/env.js';
import { GatewayError, PAYMENT_PROVIDER } from '../src/payments/provider.js';
import type { TestPaymentProvider } from '../src/payments/test.provider.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { configureApp } from '../src/setup.js';

const DOMAIN = '@e2e-p5.mindease.test';
const FEE = 800;

interface TestUser {
  id: string;
  cookies: string[];
  doctorId?: string;
}

describe('Payments & subscription (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let gateway: TestPaymentProvider;
  let doctor: TestUser;
  let admin: TestUser;
  const http = () => request(app.getHttpServer());

  async function signUp(label: string, role: 'USER' | 'DOCTOR' | 'ADMIN' = 'USER', paid = false): Promise<TestUser> {
    const user = await prisma.user.create({
      data: {
        name: `P5 ${label}`,
        email: `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}${DOMAIN}`,
        passwordHash: 'x',
        role,
        doctorProfile:
          role === 'DOCTOR'
            ? { create: { specialization: 'Psychiatry', fee: FEE, verified: true, approvalStatus: 'APPROVED' } }
            : undefined,
        subscriptions: paid ? { create: { tier: 'PAID' } } : undefined,
      },
      include: { doctorProfile: true },
    });
    const token = await app.get(JwtService).signAsync({ sub: user.id, role, tier: 'FREE' });
    return { id: user.id, cookies: [`${ACCESS_TOKEN_COOKIE}=${token}`], doctorId: user.doctorProfile?.id };
  }

  const finish = (who: TestUser, reference: string, outcome: 'PAID' | 'FAILED' | 'CANCELLED') =>
    http().post('/api/payments/test/complete').set('Cookie', who.cookies).send({ reference, outcome });

  let slotIndex = 0;
  /** Books the doctor's next unused open slot. */
  async function book(patient: TestUser) {
    const slots = (await http().get(`/api/doctors/${doctor.doctorId}/slots`).expect(200)).body.slots;
    const slot = slots[slotIndex++];
    const res = await http()
      .post('/api/appointments')
      .set('Cookie', patient.cookies)
      .send({ doctorId: doctor.doctorId, startsAt: slot.startsAt, type: 'ONLINE' })
      .expect(201);
    return { reference: res.body.reference as string, appointmentId: res.body.appointment.id as string, startsAt: slot.startsAt as string };
  }
  const isOpen = async (startsAt: string) =>
    (await http().get(`/api/doctors/${doctor.doctorId}/slots`)).body.slots.some((s: { startsAt: string }) => s.startsAt === startsAt);
  const paymentOf = (reference: string) => prisma.payment.findUniqueOrThrow({ where: { reference } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get<Env>(ENV));
    await app.init();
    prisma = app.get(PrismaService);
    gateway = app.get(PAYMENT_PROVIDER);
    doctor = await signUp('doc', 'DOCTOR');
    admin = await signUp('admin', 'ADMIN');
    await prisma.availabilitySlot.createMany({
      data: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ doctorId: doctor.doctorId!, dayOfWeek, startMinute: 0, endMinute: 1440 })),
    });
  });

  afterAll(async () => {
    const mine = { endsWith: DOMAIN };
    await prisma.payment.deleteMany({ where: { user: { email: mine } } });
    await prisma.appointment.deleteMany({ where: { patient: { email: mine } } });
    await prisma.auditLog.deleteMany({ where: { actor: { email: mine } } });
    await prisma.notification.deleteMany({ where: { title: { contains: 'P5 ' } } });
    await prisma.user.deleteMany({ where: { email: mine } });
    await app.close();
  });

  describe('Premium subscription (FR #15)', () => {
    it('upgrades a free user after payment and extends on renewal', async () => {
      const user = await signUp('upgrade');
      expect((await http().get('/api/payments/subscription').set('Cookie', user.cookies)).body.tier).toBe('FREE');

      const checkout = await http().post('/api/payments/subscription').set('Cookie', user.cookies).expect(201);
      expect(checkout.body).toMatchObject({ amount: PAID_PLAN_MONTHLY_PRICE, provider: 'test' });
      expect(checkout.body.checkoutUrl).toContain(`/dashboard/payments/test-checkout?ref=${checkout.body.reference}`);

      const pending = await http().get(`/api/payments/${checkout.body.reference}`).set('Cookie', user.cookies).expect(200);
      expect(pending.body.status).toBe('PENDING');

      const paid = await finish(user, checkout.body.reference, 'PAID').expect(200);
      expect(paid.body).toMatchObject({ status: 'SUCCEEDED', purpose: 'SUBSCRIPTION', amount: PAID_PLAN_MONTHLY_PRICE });

      const status = (await http().get('/api/payments/subscription').set('Cookie', user.cookies)).body;
      expect(status.tier).toBe('PAID');
      const firstEnd = Date.parse(status.endsAt);
      expect(firstEnd - Date.now()).toBeGreaterThan((SUBSCRIPTION_DAYS - 1) * DAY_MS);

      // Premium features unlock straight away, without a new login.
      expect((await http().get('/api/auth/me').set('Cookie', user.cookies)).body.tier).toBe('PAID');
      expect((await http().get('/api/chat/usage').set('Cookie', user.cookies)).body.limit).toBeNull();

      const renew = await http().post('/api/payments/subscription').set('Cookie', user.cookies).expect(201);
      await finish(user, renew.body.reference, 'PAID').expect(200);
      const renewed = Date.parse((await http().get('/api/payments/subscription').set('Cookie', user.cookies)).body.endsAt);
      expect(renewed - firstEnd).toBe(SUBSCRIPTION_DAYS * DAY_MS);

      const notes = await prisma.notification.findMany({ where: { userId: user.id } });
      expect(notes.filter((n) => n.type === 'SUBSCRIPTION_ACTIVATED')).toHaveLength(2);
    });

    it('leaves the user on Free when payment fails', async () => {
      const user = await signUp('declined');
      const checkout = await http().post('/api/payments/subscription').set('Cookie', user.cookies).expect(201);
      const res = await finish(user, checkout.body.reference, 'FAILED').expect(200);
      expect(res.body.status).toBe('FAILED');
      expect((await http().get('/api/payments/subscription').set('Cookie', user.cookies)).body.tier).toBe('FREE');
    });

    it('is for patients only', async () => {
      await http().post('/api/payments/subscription').set('Cookie', doctor.cookies).expect(403);
      await http().post('/api/payments/subscription').expect(401);
    });
  });

  describe('consultation payments', () => {
    it("charges exactly the doctor's fee and sends the request once paid", async () => {
      const patient = await signUp('pays', 'USER', true);
      const { reference, appointmentId } = await book(patient);
      expect((await paymentOf(reference)).amount.toNumber()).toBe(FEE);
      expect((await prisma.appointment.findUnique({ where: { id: appointmentId } }))?.status).toBe('PENDING_PAYMENT');

      await finish(patient, reference, 'PAID').expect(200);
      expect((await prisma.appointment.findUnique({ where: { id: appointmentId } }))?.status).toBe('REQUESTED');
      const mine = await http().get('/api/appointments').set('Cookie', patient.cookies).expect(200);
      expect(mine.body.find((a: { id: string }) => a.id === appointmentId).payment).toMatchObject({
        reference,
        status: 'SUCCEEDED',
        amount: FEE,
      });
    });

    it('rolls back the booking when payment fails or is cancelled (NFR #6)', async () => {
      const patient = await signUp('fails', 'USER', true);
      for (const outcome of ['FAILED', 'CANCELLED'] as const) {
        const { reference, appointmentId, startsAt } = await book(patient);
        expect(await isOpen(startsAt)).toBe(false);

        const res = await finish(patient, reference, outcome).expect(200);
        expect(res.body.status).toBe('FAILED');
        expect(await prisma.appointment.findUnique({ where: { id: appointmentId } })).toBeNull();
        expect(await isOpen(startsAt)).toBe(true);
        // The ledger keeps the failed attempt with its doctor.
        expect(await paymentOf(reference)).toMatchObject({ status: 'FAILED', appointmentId: null, doctorId: doctor.doctorId });
      }
      const doctorNotes = await prisma.notification.findMany({ where: { userId: doctor.id, title: { contains: 'P5 fails' } } });
      expect(doctorNotes).toHaveLength(0);
    });

    it('releases the slot if the gateway is down when checkout starts', async () => {
      const patient = await signUp('gateway-down', 'USER', true);
      const slots = (await http().get(`/api/doctors/${doctor.doctorId}/slots`)).body.slots;
      const startsAt = slots[slotIndex++].startsAt;
      vi.spyOn(gateway, 'startCheckout').mockRejectedValueOnce(new GatewayError('down'));
      await http()
        .post('/api/appointments')
        .set('Cookie', patient.cookies)
        .send({ doctorId: doctor.doctorId, startsAt, type: 'ONLINE' })
        .expect(503);
      expect(await isOpen(startsAt)).toBe(true);
      expect(await prisma.appointment.count({ where: { patientId: patient.id } })).toBe(0);
    });

    it(`releases unpaid holds after ${PAYMENT_HOLD_MINUTES} minutes and refunds a late payment`, async () => {
      const patient = await signUp('slow', 'USER', true);
      const { reference, appointmentId, startsAt } = await book(patient);

      const later = new Date(Date.now() + (PAYMENT_HOLD_MINUTES + 1) * 60_000);
      expect((await app.get(RemindersService).tick(later)).released).toBeGreaterThanOrEqual(1);
      expect(await prisma.appointment.findUnique({ where: { id: appointmentId } })).toBeNull();
      expect(await isOpen(startsAt)).toBe(true);

      // The patient finishes paying after the hold expired: the money must go back.
      const res = await finish(patient, reference, 'PAID').expect(200);
      expect(res.body).toMatchObject({ status: 'REFUND_DUE', failureReason: 'Payment arrived after the booking hold expired' });
    });

    it('never accepts an amount different from the fee', async () => {
      const patient = await signUp('tamper', 'USER', true);
      const { reference, appointmentId } = await book(patient);
      gateway.complete(reference, 'PAID', FEE + 500);
      const res = await http().get(`/api/payments/${reference}`).set('Cookie', patient.cookies).expect(200);
      expect(res.body.status).toBe('REFUND_DUE');
      expect(res.body.failureReason).toContain(`Paid ${FEE + 500}`);
      expect(await prisma.appointment.findUnique({ where: { id: appointmentId } })).toBeNull();
    });

    it("doesn't trust gateway callbacks without checking with the gateway", async () => {
      const patient = await signUp('forger', 'USER', true);
      const { reference } = await book(patient);
      const res = await http()
        .post('/api/payments/sslcommerz/success')
        .type('form')
        .send({ tran_id: reference, val_id: 'forged', status: 'VALID', amount: String(FEE) })
        .expect(303);
      expect(res.headers.location).toBe(`http://localhost:3000/dashboard/payments/${reference}`);
      expect((await paymentOf(reference)).status).toBe('PENDING');

      const unknown = await http().post('/api/payments/sslcommerz/success').type('form').send({ tran_id: 'MEP-NOPE' }).expect(303);
      expect(unknown.headers.location).toBe('http://localhost:3000/dashboard/billing');
    });

    it("keeps each patient's payments private", async () => {
      const owner = await signUp('owner', 'USER', true);
      const other = await signUp('other', 'USER', true);
      const { reference } = await book(owner);
      await http().get(`/api/payments/${reference}`).set('Cookie', other.cookies).expect(404);
      await finish(other, reference, 'PAID').expect(404);
      expect((await paymentOf(reference)).status).toBe('PENDING');
    });
  });

  describe('refunds and the admin ledger (FR #19)', () => {
    it('marks a declined paid booking for refund, and the admin records the refund', async () => {
      const patient = await signUp('refund', 'USER', true);
      const { reference, appointmentId } = await book(patient);
      await finish(patient, reference, 'PAID').expect(200);
      await http()
        .post(`/api/doctor/appointments/${appointmentId}/decline`)
        .set('Cookie', doctor.cookies)
        .send({ reason: 'On leave' })
        .expect(201);
      const payment = await paymentOf(reference);
      expect(payment.status).toBe('REFUND_DUE');

      const ledger = await http().get('/api/admin/payments?status=REFUND_DUE').set('Cookie', admin.cookies).expect(200);
      const row = ledger.body.items.find((p: { reference: string }) => p.reference === reference);
      expect(row).toMatchObject({
        amount: FEE,
        purpose: 'APPOINTMENT',
        doctorName: 'P5 doc',
        user: { name: 'P5 refund' },
        gatewayTxnId: `TEST-${reference}`,
      });
      expect(ledger.body.totals.refundDue).toBeGreaterThanOrEqual(FEE);

      const url = `/api/admin/payments/${payment.id}/refund`;
      await http().post(url).set('Cookie', admin.cookies).send({ note: '' }).expect(400);
      const refunded = await http().post(url).set('Cookie', admin.cookies).send({ note: 'bKash reversal 8XK2' }).expect(201);
      expect(refunded.body.status).toBe('REFUNDED');
      await http().post(url).set('Cookie', admin.cookies).send({ note: 'again' }).expect(409);

      expect(await prisma.auditLog.findFirst({ where: { action: 'PAYMENT_REFUNDED', targetId: payment.id } })).toMatchObject({
        actorId: admin.id,
        reason: 'bKash reversal 8XK2',
      });
      const types = (await prisma.notification.findMany({ where: { userId: patient.id } })).map((n) => n.type);
      expect(types).toEqual(expect.arrayContaining(['REFUND_DUE', 'REFUND_SENT']));
    });

    it('refunds when the patient cancels a paid booking', async () => {
      const patient = await signUp('cancels', 'USER', true);
      const { reference, appointmentId } = await book(patient);
      await finish(patient, reference, 'PAID').expect(200);
      await http().post(`/api/appointments/${appointmentId}/cancel`).set('Cookie', patient.cookies).send({}).expect(201);
      expect((await paymentOf(reference)).status).toBe('REFUND_DUE');
    });

    it('filters the ledger and is admin-only', async () => {
      const failed = await http().get('/api/admin/payments?status=FAILED&purpose=APPOINTMENT').set('Cookie', admin.cookies).expect(200);
      expect(failed.body.items.length).toBeGreaterThan(0);
      expect(failed.body.items.every((p: { status: string; purpose: string }) => p.status === 'FAILED' && p.purpose === 'APPOINTMENT')).toBe(true);

      const future = await http().get('/api/admin/payments?from=2099-01-01').set('Cookie', admin.cookies).expect(200);
      expect(future.body.items).toHaveLength(0);
      await http().get('/api/admin/payments?status=BOGUS').set('Cookie', admin.cookies).expect(400);

      const user = await signUp('nosy');
      await http().get('/api/admin/payments').set('Cookie', user.cookies).expect(403);
    });
  });
});
