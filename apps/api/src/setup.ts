import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { Env } from './config/env.js';

/** Middleware shared by main.ts and the e2e tests. */
export function configureApp(app: INestApplication, env: Env) {
  if (env.TRUST_PROXY) {
    // Use the visitor's address from X-Forwarded-For (set by Next.js or a load balancer),
    // so rate limits apply per visitor instead of to the proxy as a whole.
    app.getHttpAdapter().getInstance().set('trust proxy', parseTrustProxy(env.TRUST_PROXY));
  }
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: env.WEB_ORIGIN, credentials: true });
  app.enableShutdownHooks();
}

/** "true" → true, "1" → 1 hop, otherwise Express's named or CIDR list (e.g. "loopback"). */
export function parseTrustProxy(value: string): boolean | number | string {
  if (value === 'true' || value === 'false') return value === 'true';
  return /^\d+$/.test(value) ? Number(value) : value;
}
