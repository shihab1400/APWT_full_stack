import type { CheckoutRequest, GatewayResult, PaymentProvider } from './provider.js';

type Outcome = 'PAID' | 'FAILED' | 'CANCELLED';

/**
 * Stand-in gateway used when SSLCommerz credentials are not configured, and in
 * tests. Its checkout is a page in our own app with Pay / Fail / Cancel buttons.
 * State is in memory, so unfinished test payments expire after an API restart.
 */
export class TestPaymentProvider implements PaymentProvider {
  readonly name = 'test' as const;
  private readonly sessions = new Map<string, { amount: number; outcome?: Outcome; paidAmount?: number }>();

  constructor(private readonly webOrigin: string) {}

  startCheckout(req: CheckoutRequest): Promise<string> {
    this.sessions.set(req.reference, { amount: req.amount });
    return Promise.resolve(new URL(`/dashboard/payments/test-checkout?ref=${req.reference}`, this.webOrigin).toString());
  }

  /** Records what the tester chose. `paidAmount` lets tests simulate a tampered amount. */
  complete(reference: string, outcome: Outcome, paidAmount?: number): boolean {
    const session = this.sessions.get(reference);
    if (!session) return false;
    session.outcome = outcome;
    session.paidAmount = paidAmount;
    return true;
  }

  lookup(reference: string): Promise<GatewayResult> {
    const s = this.sessions.get(reference);
    if (!s?.outcome) return Promise.resolve({ status: 'PENDING' });
    if (s.outcome !== 'PAID') return Promise.resolve({ status: 'FAILED', detail: s.outcome });
    return Promise.resolve({
      status: 'PAID',
      amount: s.paidAmount ?? s.amount,
      currency: 'BDT',
      gatewayTxnId: `TEST-${reference}`,
      method: 'Test payment',
    });
  }
}
