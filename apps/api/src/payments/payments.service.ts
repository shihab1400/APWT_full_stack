import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  APPOINTMENT_TYPE_LABEL,
  PAID_PLAN_MONTHLY_PRICE,
  PAYMENT_HOLD_MINUTES,
  SUBSCRIPTION_DAYS,
  type AdminPaymentItem,
  type AdminPaymentLedger,
  type Checkout,
  type PaymentItem,
  type PaymentStatus,
  type SubscriptionStatus,
} from '@mindease/shared';
import { DAY_MS, formatDhaka } from '../common/dhaka-time.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { GatewayError, PAYMENT_PROVIDER, newReference, type PaymentProvider } from './provider.js';

const PATIENT_APPOINTMENTS = '/dashboard/appointments';
const DOCTOR_APPOINTMENTS = '/doctor/appointments';
const BILLING = '/dashboard/billing';

const include = {
  user: { select: { id: true, name: true, email: true } },
  doctor: { select: { user: { select: { name: true } } } },
  appointment: { select: { id: true, startsAt: true } },
} as const;
type PaymentRow = Prisma.PaymentGetPayload<{ include: typeof include }>;

export interface LedgerFilters {
  status?: PaymentStatus;
  purpose?: 'APPOINTMENT' | 'SUBSCRIPTION';
  from?: Date;
  to?: Date;
}

const bdt = (n: number) => `${n.toLocaleString('en-US')} BDT`;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @Inject(PAYMENT_PROVIDER) readonly provider: PaymentProvider,
  ) {}

  // ───────────── Starting payments ─────────────

  /** Premium for SUBSCRIPTION_DAYS; extends the current period if there is one. */
  async startSubscription(userId: string): Promise<Checkout> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });
    const payment = await this.prisma.payment.create({
      data: {
        reference: newReference(),
        userId: user.id,
        purpose: 'SUBSCRIPTION',
        amount: PAID_PLAN_MONTHLY_PRICE,
        provider: this.provider.name,
      },
    });
    return this.checkout(payment.id, {
      reference: payment.reference,
      amount: PAID_PLAN_MONTHLY_PRICE,
      productName: `MindEase Oasis Premium (${SUBSCRIPTION_DAYS} days)`,
      customer: user,
    });
  }

  /** Row for a booking's consultation fee; created inside the booking transaction. */
  createAppointmentPayment(
    tx: Prisma.TransactionClient,
    data: { userId: string; appointmentId: string; doctorId: string; amount: number },
  ) {
    return tx.payment.create({
      data: { ...data, reference: newReference(), purpose: 'APPOINTMENT', provider: this.provider.name },
    });
  }

  /**
   * Opens the gateway session. If the gateway can't be reached, the payment
   * fails and any held booking is released, so nothing is left half-done.
   */
  async checkout(
    paymentId: string,
    req: Parameters<PaymentProvider['startCheckout']>[0],
  ): Promise<Checkout> {
    try {
      const checkoutUrl = await this.provider.startCheckout(req);
      return { reference: req.reference, checkoutUrl, amount: req.amount, provider: this.provider.name };
    } catch (err) {
      this.logger.error(`Checkout ${req.reference} failed: ${String(err)}`);
      await this.fail(paymentId, 'The payment gateway could not be reached');
      throw new ServiceUnavailableException(
        err instanceof GatewayError
          ? 'The payment gateway is unavailable right now. Please try again in a few minutes.'
          : 'Could not start the payment. Please try again.',
      );
    }
  }

  // ───────────── Settling payments ─────────────

  /**
   * Brings a payment in line with what the gateway reports. Safe to call any
   * number of times, from the browser return, the IPN, a status check or the
   * expiry sweep.
   * @param userGaveUp the user cancelled or failed at the gateway, so an unpaid
   *   result can be settled now instead of waiting for the hold to expire.
   */
  async reconcile(reference: string, opts: { valId?: string; userGaveUp?: boolean } = {}): Promise<PaymentRow> {
    const payment = await this.byReference(reference);
    if (payment.status !== 'PENDING' && payment.status !== 'FAILED') return payment;

    let result;
    try {
      result = await this.provider.lookup(reference, opts.valId);
    } catch (err) {
      this.logger.warn(`Lookup ${reference} failed: ${String(err)}`);
      return payment;
    }

    if (result.status === 'PAID') {
      const expected = payment.amount.toNumber();
      if (result.amount !== expected || (result.currency && result.currency !== payment.currency)) {
        await this.refundInstead(payment, `Paid ${result.amount} ${result.currency ?? ''} but ${expected} ${payment.currency} was due`.trim(), result);
      } else if (payment.status === 'FAILED') {
        // Paid after the hold expired: the money arrived but the booking is gone.
        await this.refundInstead(payment, 'Payment arrived after the booking hold expired', result);
      } else {
        await this.succeed(payment, result);
      }
    } else if (result.status === 'FAILED' || (opts.userGaveUp && payment.status === 'PENDING')) {
      await this.fail(payment.id, opts.userGaveUp ? 'Payment was cancelled or declined at the gateway' : `Gateway reported ${result.detail ?? 'failure'}`);
    }
    return this.byReference(reference);
  }

  /** Settles payments still pending after the hold period; run every minute. */
  async expireStale(now = new Date()): Promise<number> {
    const stale = await this.prisma.payment.findMany({
      where: { status: 'PENDING', createdAt: { lt: new Date(now.getTime() - PAYMENT_HOLD_MINUTES * 60_000) } },
      select: { id: true, reference: true },
    });
    let failed = 0;
    for (const p of stale) {
      // A payment whose callback was lost may still have gone through.
      const after = await this.reconcile(p.reference);
      if (after.status === 'PENDING') {
        await this.fail(p.id, `Not paid within ${PAYMENT_HOLD_MINUTES} minutes`);
        failed++;
      }
    }
    return failed;
  }

  private async succeed(payment: PaymentRow, result: { gatewayTxnId?: string; method?: string }) {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.payment.updateMany({
        where: { id: payment.id, status: 'PENDING' },
        data: {
          status: 'SUCCEEDED',
          paidAt: new Date(),
          gatewayTxnId: result.gatewayTxnId ?? null,
          method: result.method ?? null,
          failureReason: null,
        },
      });
      if (!claimed.count) return 'already-settled' as const;

      if (payment.purpose === 'SUBSCRIPTION') {
        return { endsAt: await this.extendPremium(tx, payment.userId, payment.id) };
      }
      const moved = await tx.appointment.updateMany({
        where: { id: payment.appointmentId ?? '', status: 'PENDING_PAYMENT' },
        data: { status: 'REQUESTED' },
      });
      if (!moved.count) {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'REFUND_DUE', failureReason: 'The booking was no longer held' },
        });
        return 'refund' as const;
      }
      // Lets admins see that a high-risk user followed the advice to see a doctor (FR #20).
      await tx.riskAlert.updateMany({
        where: { userId: payment.userId, bookedDoctor: false },
        data: { bookedDoctor: true },
      });
      return 'booked' as const;
    });

    if (outcome === 'already-settled') return;
    if (outcome === 'refund') return this.announceRefundDue(payment, 'The booking was no longer held');
    if (typeof outcome === 'object') {
      await this.notifications.notify(payment.userId, {
        type: 'SUBSCRIPTION_ACTIVATED',
        title: 'Premium is active',
        body: `Payment of ${bdt(payment.amount.toNumber())} received (ref ${payment.reference}). Premium runs until ${formatDhaka(outcome.endsAt)}.`,
        link: BILLING,
        email: true,
      });
      return;
    }
    await this.announceBooking(payment);
  }

  private async announceBooking(payment: PaymentRow) {
    const appt = await this.prisma.appointment.findUnique({
      where: { id: payment.appointmentId! },
      include: { doctor: { select: { userId: true, user: { select: { name: true } } } }, patient: { select: { name: true } } },
    });
    if (!appt) return;
    const when = `${APPOINTMENT_TYPE_LABEL[appt.type]} · ${formatDhaka(appt.startsAt)}`;
    await this.notifications.notify(payment.userId, {
      type: 'PAYMENT_RECEIVED',
      title: `Payment received: request sent to ${appt.doctor.user.name}`,
      body: `${when}. Paid ${bdt(payment.amount.toNumber())} (ref ${payment.reference}). You'll be notified when the doctor responds.`,
      link: PATIENT_APPOINTMENTS,
      email: true,
    });
    await this.notifications.notify(appt.doctor.userId, {
      type: 'APPOINTMENT_REQUESTED',
      title: `New booking request from ${appt.patient.name}`,
      body: when,
      link: DOCTOR_APPOINTMENTS,
      email: true,
    });
  }

  /** Marks a pending payment failed and releases its held booking, atomically. */
  async fail(paymentId: string, reason: string): Promise<void> {
    const released = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!payment) return false;
      const { count } = await tx.payment.updateMany({
        where: { id: paymentId, status: 'PENDING' },
        data: { status: 'FAILED', failureReason: reason },
      });
      if (!count || !payment.appointmentId) return false;
      // The unpaid booking is removed entirely; the payment keeps doctorId for the ledger.
      await tx.appointment.deleteMany({ where: { id: payment.appointmentId, status: 'PENDING_PAYMENT' } });
      return true;
    });
    if (released) {
      const payment = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
      await this.notifications.notify(payment.userId, {
        type: 'PAYMENT_FAILED',
        title: 'Payment not completed: your time slot was released',
        body: `Ref ${payment.reference}. No money was taken for this booking. Please choose a time again.`,
        link: '/doctors',
      });
    }
  }

  private async refundInstead(payment: PaymentRow, reason: string, result: { gatewayTxnId?: string; method?: string }) {
    const changed = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.payment.updateMany({
        where: { id: payment.id, status: { in: ['PENDING', 'FAILED'] } },
        data: {
          status: 'REFUND_DUE',
          failureReason: reason,
          paidAt: new Date(),
          gatewayTxnId: result.gatewayTxnId ?? null,
          method: result.method ?? null,
        },
      });
      if (count && payment.appointmentId) {
        await tx.appointment.deleteMany({ where: { id: payment.appointmentId, status: 'PENDING_PAYMENT' } });
      }
      return count > 0;
    });
    if (changed) await this.announceRefundDue(payment, reason);
  }

  // ───────────── Refunds ─────────────

  /**
   * Called when a paid appointment won't happen (declined, cancelled, expired).
   * The patient gets a full refund, sent by an admin.
   */
  async refundDueForAppointment(appointmentId: string, reason: string): Promise<void> {
    const payment = await this.prisma.payment.findUnique({ where: { appointmentId }, include });
    if (!payment) return;
    const { count } = await this.prisma.payment.updateMany({
      where: { id: payment.id, status: 'SUCCEEDED' },
      data: { status: 'REFUND_DUE', failureReason: reason },
    });
    if (count) await this.announceRefundDue(payment, reason);
  }

  private async announceRefundDue(payment: PaymentRow, reason: string) {
    const amount = bdt(payment.amount.toNumber());
    await this.notifications.notify(payment.userId, {
      type: 'REFUND_DUE',
      title: `A refund of ${amount} is on its way`,
      body: `Ref ${payment.reference}. ${reason}. Our team will send it back to your original payment method.`,
      link: BILLING,
      email: true,
    });
    await this.notifications.notifyAdmins({
      type: 'REFUND_DUE',
      title: `Refund due: ${amount} to ${payment.user.name}`,
      body: `Ref ${payment.reference}. ${reason}.`,
      link: '/admin/payments',
    });
  }

  async markRefunded(actorId: string, paymentId: string, note: string): Promise<AdminPaymentItem> {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId }, include });
    if (!payment) throw new NotFoundException('Payment not found');
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.payment.updateMany({
        where: { id: paymentId, status: 'REFUND_DUE' },
        data: { status: 'REFUNDED', refundedAt: new Date() },
      });
      if (!count) throw new ConflictException('Only payments marked "refund due" can be refunded');
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'PAYMENT_REFUNDED',
          targetType: 'Payment',
          targetId: paymentId,
          reason: note,
          meta: { reference: payment.reference, amount: payment.amount.toNumber() },
        },
      });
    });

    await this.notifications.notify(payment.userId, {
      type: 'REFUND_SENT',
      title: `Refund of ${bdt(payment.amount.toNumber())} sent`,
      body: `Ref ${payment.reference}. It can take a few working days to appear, depending on your bank or wallet.`,
      link: BILLING,
      email: true,
    });
    return toAdminItem(await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, include }));
  }

  // ───────────── Reading ─────────────

  async listMine(userId: string): Promise<PaymentItem[]> {
    const rows = await this.prisma.payment.findMany({
      where: { userId },
      include,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map(toItem);
  }

  /** One of my payments; asks the gateway first if it's still pending. */
  async getMine(userId: string, reference: string): Promise<PaymentItem> {
    const payment = await this.prisma.payment.findFirst({ where: { reference, userId } });
    if (!payment) throw new NotFoundException('Payment not found');
    return toItem(payment.status === 'PENDING' ? await this.reconcile(reference) : await this.byReference(reference));
  }

  async subscriptionStatus(userId: string): Promise<SubscriptionStatus> {
    const now = new Date();
    const active = await this.prisma.subscription.findMany({
      where: {
        userId,
        tier: 'PAID',
        status: 'ACTIVE',
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      select: { endsAt: true },
    });
    const openEnded = active.some((s) => !s.endsAt);
    const latest = active.reduce<Date | null>((m, s) => (s.endsAt && (!m || s.endsAt > m) ? s.endsAt : m), null);
    return {
      tier: active.length ? 'PAID' : 'FREE',
      endsAt: openEnded ? null : (latest?.toISOString() ?? null),
      price: PAID_PLAN_MONTHLY_PRICE,
      periodDays: SUBSCRIPTION_DAYS,
    };
  }

  async ledger(f: LedgerFilters): Promise<AdminPaymentLedger> {
    const rows = await this.prisma.payment.findMany({
      where: { status: f.status, purpose: f.purpose, createdAt: { gte: f.from, lt: f.to } },
      include,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const sum = (statuses: PaymentStatus[]) =>
      rows.filter((r) => statuses.includes(r.status)).reduce((t, r) => t + r.amount.toNumber(), 0);
    return {
      items: rows.map(toAdminItem),
      totals: {
        received: sum(['SUCCEEDED', 'REFUND_DUE', 'REFUNDED']),
        refundDue: sum(['REFUND_DUE']),
        refunded: sum(['REFUNDED']),
      },
    };
  }

  private async byReference(reference: string): Promise<PaymentRow> {
    const payment = await this.prisma.payment.findUnique({ where: { reference }, include });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  /** Adds SUBSCRIPTION_DAYS to the current Premium period, or starts one now. */
  private async extendPremium(tx: Prisma.TransactionClient, userId: string, paymentId: string): Promise<Date> {
    const now = new Date();
    const current = await tx.subscription.findFirst({
      where: { userId, tier: 'PAID', status: 'ACTIVE', startsAt: { lte: now }, endsAt: { gt: now } },
      orderBy: { endsAt: 'desc' },
    });
    const period = SUBSCRIPTION_DAYS * DAY_MS;
    const sub = current
      ? await tx.subscription.update({
          where: { id: current.id },
          data: { endsAt: new Date(current.endsAt!.getTime() + period) },
        })
      : await tx.subscription.create({
          data: { userId, tier: 'PAID', startsAt: now, endsAt: new Date(now.getTime() + period) },
        });
    await tx.payment.update({ where: { id: paymentId }, data: { subscriptionId: sub.id } });
    return sub.endsAt!;
  }
}

function toItem(p: PaymentRow): PaymentItem {
  return {
    id: p.id,
    reference: p.reference,
    purpose: p.purpose,
    amount: p.amount.toNumber(),
    currency: p.currency,
    status: p.status,
    provider: p.provider,
    method: p.method,
    failureReason: p.failureReason,
    createdAt: p.createdAt.toISOString(),
    paidAt: p.paidAt?.toISOString() ?? null,
    refundedAt: p.refundedAt?.toISOString() ?? null,
    doctorName: p.doctor?.user.name ?? null,
    appointmentId: p.appointment?.id ?? null,
    appointmentStartsAt: p.appointment?.startsAt.toISOString() ?? null,
  };
}

function toAdminItem(p: PaymentRow): AdminPaymentItem {
  return { ...toItem(p), gatewayTxnId: p.gatewayTxnId, user: p.user };
}
