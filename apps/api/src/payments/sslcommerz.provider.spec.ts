import type { Env } from '../config/env.js';
import { GatewayError } from './provider.js';
import { SslCommerzProvider } from './sslcommerz.provider.js';

const env = {
  SSLCOMMERZ_STORE_ID: 'store1',
  SSLCOMMERZ_STORE_PASSWORD: 'secret@ssl',
  SSLCOMMERZ_SANDBOX: true,
  WEB_ORIGIN: 'http://localhost:3000',
} as Env;

/** A fetch stand-in that answers by URL path and records requests. */
function fakeFetch(routes: Record<string, unknown>) {
  const calls: { url: URL; body?: URLSearchParams }[] = [];
  const http = (async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    calls.push({ url, body: init?.body as URLSearchParams | undefined });
    const key = Object.keys(routes).find((k) => url.pathname.endsWith(k));
    if (!key) return new Response('not found', { status: 404 });
    return Response.json(routes[key]);
  }) as typeof fetch;
  return { http, calls };
}

const checkout = {
  reference: 'MEP-ABC',
  amount: 800,
  productName: 'Consultation',
  customer: { name: 'Rahim', email: 'rahim@example.com' },
};

describe('SslCommerzProvider', () => {
  it('opens a sandbox session with our callbacks and the exact amount', async () => {
    const { http, calls } = fakeFetch({
      '/gwprocess/v4/api.php': { status: 'SUCCESS', GatewayPageURL: 'https://sandbox.sslcommerz.com/pay/xyz' },
    });
    const url = await new SslCommerzProvider(env, http).startCheckout(checkout);
    expect(url).toBe('https://sandbox.sslcommerz.com/pay/xyz');

    const { url: called, body } = calls[0];
    expect(called.origin).toBe('https://sandbox.sslcommerz.com');
    expect(Object.fromEntries(body!)).toMatchObject({
      store_id: 'store1',
      total_amount: '800.00',
      currency: 'BDT',
      tran_id: 'MEP-ABC',
      success_url: 'http://localhost:3000/api/payments/sslcommerz/success',
      ipn_url: 'http://localhost:3000/api/payments/sslcommerz/ipn',
      cus_email: 'rahim@example.com',
      product_profile: 'non-physical-goods',
    });
  });

  it('uses the live gateway when sandbox is off', async () => {
    const { http, calls } = fakeFetch({ '/gwprocess/v4/api.php': { status: 'SUCCESS', GatewayPageURL: 'x' } });
    await new SslCommerzProvider({ ...env, SSLCOMMERZ_SANDBOX: false }, http).startCheckout(checkout);
    expect(calls[0].url.origin).toBe('https://securepay.sslcommerz.com');
  });

  it('reports a refused session as a gateway error', async () => {
    const { http } = fakeFetch({ '/gwprocess/v4/api.php': { status: 'FAILED', failedreason: 'Store Credential Error' } });
    await expect(new SslCommerzProvider(env, http).startCheckout(checkout)).rejects.toThrow(GatewayError);
  });

  it('trusts a val_id only when it validates for the same transaction', async () => {
    const { http, calls } = fakeFetch({
      'validationserverAPI.php': { status: 'VALID', tran_id: 'MEP-ABC', amount: '800.00', currency_type: 'BDT', bank_tran_id: 'B1', card_type: 'BKASH-BKash' },
      'merchantTransIDvalidationAPI.php': { APIConnect: 'DONE', element: [] },
    });
    const provider = new SslCommerzProvider(env, http);
    expect(await provider.lookup('MEP-ABC', 'val1')).toEqual({
      status: 'PAID',
      amount: 800,
      currency: 'BDT',
      gatewayTxnId: 'B1',
      method: 'BKASH-BKash',
    });
    // A valid val_id from someone else's transaction is ignored.
    expect((await provider.lookup('MEP-OTHER', 'val1')).status).toBe('PENDING');
    expect(calls.at(-1)!.url.searchParams.get('tran_id')).toBe('MEP-OTHER');
  });

  it('maps transaction-ID queries to paid, failed or pending', async () => {
    const answer = (statuses: string[]) =>
      new SslCommerzProvider(
        env,
        fakeFetch({
          'merchantTransIDvalidationAPI.php': {
            APIConnect: 'DONE',
            element: statuses.map((status) => ({ status, tran_id: 'MEP-ABC', amount: '800.00', currency_type: 'BDT' })),
          },
        }).http,
      ).lookup('MEP-ABC');

    expect((await answer(['FAILED', 'VALIDATED'])).status).toBe('PAID');
    expect((await answer(['FAILED', 'CANCELLED'])).status).toBe('FAILED');
    expect((await answer(['UNATTEMPTED'])).status).toBe('PENDING');
    expect((await answer([])).status).toBe('PENDING');
  });

  it('turns network problems into gateway errors', async () => {
    const http = (() => Promise.reject(new Error('ECONNRESET'))) as unknown as typeof fetch;
    await expect(new SslCommerzProvider(env, http).lookup('MEP-ABC')).rejects.toThrow('Could not reach SSLCommerz');
  });
});
