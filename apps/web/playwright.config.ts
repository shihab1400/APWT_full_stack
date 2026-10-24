import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests for the main journeys (system testing level in the test plan).
 * Starts its own production builds on separate ports, with SSLCommerz, email
 * and Gemini switched off so runs are free, offline-safe and repeatable.
 * Needs the seeded database (pnpm db:seed). Run with: pnpm test:browser
 */
const WEB_PORT = 3100;
const API_PORT = 4100;
const WEB = `http://localhost:${WEB_PORT}`;
const API = `http://localhost:${API_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // The journeys share the seeded demo doctor, so they run one at a time.
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: WEB,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm --filter api build && pnpm --filter api start:prod",
      cwd: "../..",
      url: `${API}/api/health`,
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        PORT: String(API_PORT),
        WEB_ORIGIN: WEB,
        TRUST_PROXY: "loopback",
        // Empty values override apps/api/.env (dotenv never replaces set variables).
        SSLCOMMERZ_STORE_ID: "",
        SSLCOMMERZ_STORE_PASSWORD: "",
        SMTP_USER: "",
        SMTP_PASS: "",
        GEMINI_API_KEY: "",
      },
    },
    {
      // API_URL is read at build time for the /api rewrite.
      command: `pnpm --filter web build && pnpm --filter web start --port ${WEB_PORT}`,
      cwd: "../..",
      url: WEB,
      timeout: 300_000,
      reuseExistingServer: false,
      env: { API_URL: API },
    },
  ],
});
