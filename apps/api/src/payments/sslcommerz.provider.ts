import { Logger } from '@nestjs/common';
import type { Env } from '../config/env.js';
import { GatewayError, type CheckoutRequest, type GatewayResult, type PaymentProvider } from './provider.js';

const TIMEOUT_MS = 15_000;
const PAID = new Set(['VALID', 'VALIDATED']);
const UNPAID = new Set(['FAILED', 'CANCELLED', 'EXPIRED', 'INVALID_TRANSACTION']);

interface ValidationRecord {
  status?: string;
  tran_id?: string;
  amount?: string;
  currency?: string;
  currency_type?: string;
  currency_amount?: string;
  bank_tran_id?: string;
  card_type?: string;
}

/**
 * SSLCommerz hosted checkout (v4). Sandbox or live depending on SSLCOMMERZ_SANDBOX.
 * Docs: https://developer.sslcommerz.com/doc/v4/
 */
export class SslCommerzProvider implements PaymentProvider {
  readonly name = 'sslcommerz' as const;
  private readonly logger = new Logger(SslCommerzProvider.name);
  private readonly base: string;
  private readonly callbackBase: string;

  constructor(
    private readonly env: Env,
    private readonly http: typeof fetch = fetch,
  ) {
    this.base = env.SSLCOMMERZ_SANDBOX ? 'https://sandbox.sslcommerz.com' : 'https://securepay.sslcommerz.com';
    this.callbackBase = `${(env.PAYMENT_CALLBACK_BASE_URL ?? env.WEB_ORIGIN).replace(/\/$/, '')}/api/payments/sslcommerz`;
  }

  async startCheckout(req: CheckoutRequest): Promise<string> {
    const form = new URLSearchParams({
      store_id: this.env.SSLCOMMERZ_STORE_ID!,
      store_passwd: this.env.SSLCOMMERZ_STORE_PASSWORD!,
      total_amount: req.amount.toFixed(2),
      currency: 'BDT',
      tran_id: req.reference,
      success_url: `${this.callbackBase}/success`,
      fail_url: `${this.callbackBase}/fail`,
      cancel_url: `${this.callbackBase}/cancel`,
      ipn_url: `${this.callbackBase}/ipn`,
      // Required by the API. We don't collect addresses or phone numbers.
      cus_name: req.customer.name,
      cus_email: req.customer.email,
      cus_add1: 'Dhaka',
      cus_city: 'Dhaka',
      cus_postcode: '1000',
      cus_country: 'Bangladesh',
      cus_phone: 'Not provided',
      shipping_method: 'NO',
      num_of_item: '1',
      product_name: req.productName,
      product_category: 'Healthcare',
      product_profile: 'non-physical-goods',
    });

    const data = await this.call<{ status?: string; GatewayPageURL?: string; failedreason?: string }>(
      '/gwprocess/v4/api.php',
      { method: 'POST', body: form },
    );
    if (data.status !== 'SUCCESS' || !data.GatewayPageURL) {
      throw new GatewayError(`SSLCommerz refused the session: ${data.failedreason ?? data.status ?? 'unknown'}`);
    }
    return data.GatewayPageURL;
  }

  async lookup(reference: string, valId?: string): Promise<GatewayResult> {
    const auth = {
      store_id: this.env.SSLCOMMERZ_STORE_ID!,
      store_passwd: this.env.SSLCOMMERZ_STORE_PASSWORD!,
      format: 'json',
    };

    if (valId) {
      const v = await this.call<ValidationRecord>(
        `/validator/api/validationserverAPI.php?${new URLSearchParams({ ...auth, val_id: valId, v: '1' })}`,
      );
      // A val_id for a different transaction is ignored, not trusted.
      if (v.tran_id === reference && v.status && PAID.has(v.status)) return paid(v);
    }

    const q = await this.call<{ APIConnect?: string; element?: ValidationRecord[] }>(
      `/validator/api/merchantTransIDvalidationAPI.php?${new URLSearchParams({ ...auth, tran_id: reference })}`,
    );
    if (q.APIConnect && q.APIConnect !== 'DONE') {
      throw new GatewayError(`SSLCommerz query failed: ${q.APIConnect}`);
    }
    const records = (q.element ?? []).filter((r) => r.tran_id === reference);
    const hit = records.find((r) => r.status && PAID.has(r.status));
    if (hit) return paid(hit);
    if (records.length && records.every((r) => r.status && UNPAID.has(r.status))) {
      return { status: 'FAILED', detail: records.map((r) => r.status).join(', ') };
    }
    return { status: 'PENDING', detail: records.length ? records.map((r) => r.status).join(', ') : 'not found' };
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    try {
      const res = await this.http(`${this.base}${path}`, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new GatewayError(`SSLCommerz HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof GatewayError) throw err;
      this.logger.warn(`SSLCommerz request failed: ${String(err)}`);
      throw new GatewayError('Could not reach SSLCommerz');
    }
  }
}

function paid(r: ValidationRecord): GatewayResult {
  // For foreign-currency payments SSLCommerz reports the BDT amount in `amount`
  // and the original in currency_amount; we always charge in BDT.
  return {
    status: 'PAID',
    amount: Number(r.amount),
    currency: r.currency_type ?? r.currency ?? 'BDT',
    gatewayTxnId: r.bank_tran_id,
    method: r.card_type,
  };
}
