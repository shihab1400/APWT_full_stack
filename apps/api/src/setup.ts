import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { Env } from './config/env.js';

/** Middleware shared by main.ts and the e2e tests. */
export function configureApp(app: INestApplication, env: Env) {
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: env.WEB_ORIGIN, credentials: true });
  app.enableShutdownHooks();
}
