import { z } from 'zod';
import type { AppointmentItem } from './appointments.js';

/** Days of Premium bought by one monthly payment. */
export const SUBSCRIPTION_DAYS = 30;
/** An unpaid booking holds its slot this long before it is released. */
export const PAYMENT_HOLD_MINUTES = 15;

export const PaymentStatus = {
  PENDING: 'PENDING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  REFUND_DUE: 'REFUND_DUE',
  REFUNDED: 'REFUNDED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export type PaymentPurpose = 'APPOINTMENT' | 'SUBSCRIPTION';

/** Returned when a payment starts: send the browser to `checkoutUrl`. */
export interface Checkout {
  reference: string;
  checkoutUrl: string;
  amount: number;
  /** "test" while SSLCommerz credentials are not configured. */
  provider: 'sslcommerz' | 'test';
}

export interface BookingCheckout extends Checkout {
  appointment: AppointmentItem;
}

export interface PaymentItem {
  id: string;
  reference: string;
  purpose: PaymentPurpose;
  amount: number;
  currency: string;
  status: PaymentStatus;
  provider: string;
  method: string | null;
  failureReason: string | null;
  createdAt: string;
  paidAt: string | null;
  refundedAt: string | null;
  /** Doctor for appointment payments. */
  doctorName: string | null;
  appointmentId: string | null;
  appointmentStartsAt: string | null;
}

export interface AdminPaymentItem extends PaymentItem {
  gatewayTxnId: string | null;
  user: { id: string; name: string; email: string };
}

export interface AdminPaymentLedger {
  items: AdminPaymentItem[];
  /** Totals for the filtered rows, in BDT. */
  totals: { received: number; refundDue: number; refunded: number };
}

export interface SubscriptionStatus {
  tier: 'FREE' | 'PAID';
  /** End of the current Premium period, or null when free or open-ended. */
  endsAt: string | null;
  price: number;
  periodDays: number;
}

export const refundSchema = z.object({
  note: z.string().trim().min(3, { error: 'Note how the refund was sent' }).max(300),
});
export type RefundDto = z.infer<typeof refundSchema>;

/** Test checkout only (no SSLCommerz credentials): the outcome the tester picked. */
export const testCheckoutSchema = z.object({
  reference: z.string().min(1).max(30),
  outcome: z.enum(['PAID', 'FAILED', 'CANCELLED']),
});
export type TestCheckoutDto = z.infer<typeof testCheckoutSchema>;
