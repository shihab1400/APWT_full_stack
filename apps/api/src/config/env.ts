import { z } from 'zod';

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(7),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  /** Private uploads such as doctor licences. Relative paths resolve from the API folder. */
  UPLOAD_DIR: z.string().default('uploads'),
  /** SMTP email. Without SMTP_USER and SMTP_PASS, emails are only logged. */
  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().int().default(465),
  /** true for port 465 (TLS from the start), false for 587 (STARTTLS). */
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  SMTP_USER: z.string().optional(),
  /** For Gmail, a 16-character App Password, not the account password. */
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  /** SSLCommerz store credentials. Without them, a built-in test checkout is used (not in production). */
  SSLCOMMERZ_STORE_ID: z.string().optional(),
  SSLCOMMERZ_STORE_PASSWORD: z.string().optional(),
  SSLCOMMERZ_SANDBOX: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  /**
   * Public base URL the gateway sends the browser (and its IPN) back to.
   * Defaults to WEB_ORIGIN, whose /api/* is proxied to this API.
   */
  PAYMENT_CALLBACK_BASE_URL: z.string().optional(),
  /** 32 random bytes, base64. Encrypts chats, notes and messages at rest. Losing it makes them unreadable. */
  DATA_ENCRYPTION_KEY: z.string().min(1, { error: 'is required (see .env.example)' }),
  /**
   * Express "trust proxy": set when requests arrive through the Next.js rewrite
   * or a load balancer, so rate limits apply per visitor rather than per proxy.
   * e.g. "loopback" for Next on the same machine, or a hop count like "1".
   */
  TRUST_PROXY: z.string().optional(),
  /** Serve Swagger at /api/docs. Off by default in production. */
  ENABLE_API_DOCS: z.enum(['true', 'false']).optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-3.5-flash'),
  /** Comma-separated; tried in order when the primary model fails or is rate limited. */
  GEMINI_FALLBACK_MODELS: z.string().default('gemini-2.5-flash,gemini-3.1-flash-lite'),
});

/** Production refuses to start with development defaults. */
const envSchema = baseSchema.superRefine((env, ctx) => {
  if (env.NODE_ENV !== 'production') return;
  const fail = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
  if (env.JWT_ACCESS_SECRET.length < 32) fail('JWT_ACCESS_SECRET', 'use at least 32 random characters in production');
  if (!env.WEB_ORIGIN.startsWith('https://')) fail('WEB_ORIGIN', 'must be an https:// URL in production');
  if (!env.SSLCOMMERZ_STORE_ID || !env.SSLCOMMERZ_STORE_PASSWORD) fail('SSLCOMMERZ_STORE_ID', 'payments need SSLCommerz credentials in production');
});

export type Env = z.infer<typeof envSchema>;

export const ENV = Symbol('ENV');

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
