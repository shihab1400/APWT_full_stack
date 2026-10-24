import { Logger, Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { AdminPaymentsController, PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { PAYMENT_PROVIDER, type PaymentProvider } from './provider.js';
import { SslCommerzProvider } from './sslcommerz.provider.js';
import { TestPaymentProvider } from './test.provider.js';

function chooseProvider(env: Env): PaymentProvider {
  const logger = new Logger('Payments');
  if (env.NODE_ENV !== 'test' && env.SSLCOMMERZ_STORE_ID && env.SSLCOMMERZ_STORE_PASSWORD) {
    logger.log(`SSLCommerz ${env.SSLCOMMERZ_SANDBOX ? 'sandbox' : 'LIVE'} store ${env.SSLCOMMERZ_STORE_ID}`);
    return new SslCommerzProvider(env);
  }
  if (env.NODE_ENV === 'production') {
    throw new Error('SSLCOMMERZ_STORE_ID and SSLCOMMERZ_STORE_PASSWORD are required in production');
  }
  if (env.NODE_ENV !== 'test') logger.warn('SSLCommerz not configured: using the built-in test checkout');
  return new TestPaymentProvider(env.WEB_ORIGIN);
}

@Module({
  controllers: [PaymentsController, AdminPaymentsController],
  providers: [
    PaymentsService,
    { provide: PAYMENT_PROVIDER, inject: [ENV], useFactory: chooseProvider },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
