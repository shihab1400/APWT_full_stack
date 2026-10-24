import { randomBytes } from 'node:crypto';

/** What the gateway says about one of our transactions. */
export interface GatewayResult {
  status: 'PAID' | 'FAILED' | 'PENDING';
  amount?: number;
  currency?: string;
  /** Gateway's own transaction ID (bank_tran_id for SSLCommerz). */
  gatewayTxnId?: string;
  method?: string;
  detail?: string;
}

export interface CheckoutRequest {
  reference: string;
  amount: number;
  productName: string;
  customer: { name: string; email: string };
}

/**
 * A hosted-checkout payment gateway. All money goes to the platform's own
 * merchant account; doctors are paid out separately.
 */
export interface PaymentProvider {
  readonly name: 'sslcommerz' | 'test';
  /** Opens a checkout session and returns the URL to send the browser to. */
  startCheckout(req: CheckoutRequest): Promise<string>;
  /**
   * Asks the gateway for the real state of a transaction. Callback bodies are
   * never trusted on their own; `valId` comes from a callback and is checked too.
   */
  lookup(reference: string, valId?: string): Promise<GatewayResult>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

/** Our transaction ID: "MEP-" + 16 hex characters, within SSLCommerz's 30-character limit. */
export const newReference = () => `MEP-${randomBytes(8).toString('hex').toUpperCase()}`;

export class GatewayError extends Error {}
