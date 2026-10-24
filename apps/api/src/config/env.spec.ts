import { loadEnv } from './env.js';
import { parseTrustProxy } from '../setup.js';

const base = {
  DATABASE_URL: 'postgresql://localhost/db',
  JWT_ACCESS_SECRET: 'dev-secret-0123456789',
  DATA_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
};

describe('loadEnv', () => {
  it('accepts development defaults', () => {
    expect(loadEnv(base)).toMatchObject({ NODE_ENV: 'development', PORT: 4000 });
  });

  it('requires an encryption key', () => {
    const { DATA_ENCRYPTION_KEY: _key, ...rest } = base;
    expect(() => loadEnv(rest)).toThrow('DATA_ENCRYPTION_KEY');
  });

  it('refuses development settings in production', () => {
    let message = '';
    try {
      loadEnv({ ...base, NODE_ENV: 'production', WEB_ORIGIN: 'http://example.com' });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain('JWT_ACCESS_SECRET');
    expect(message).toContain('WEB_ORIGIN');
    expect(message).toContain('SSLCOMMERZ_STORE_ID');
  });

  it('accepts a complete production configuration', () => {
    expect(
      loadEnv({
        ...base,
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'x'.repeat(48),
        WEB_ORIGIN: 'https://mindease.example.com',
        SSLCOMMERZ_STORE_ID: 'store',
        SSLCOMMERZ_STORE_PASSWORD: 'secret',
      }).NODE_ENV,
    ).toBe('production');
  });
});

describe('parseTrustProxy', () => {
  it('understands booleans, hop counts and names', () => {
    expect(parseTrustProxy('true')).toBe(true);
    expect(parseTrustProxy('1')).toBe(1);
    expect(parseTrustProxy('loopback')).toBe('loopback');
  });
});
