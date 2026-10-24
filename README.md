# MindEase Oasis

AI and expert support for mental health. This is a pnpm + Turborepo monorepo.

| Path | What |
|---|---|
| `apps/web` | Next.js 16 frontend (port 3000) |
| `apps/api` | NestJS 12 API + Prisma 7 (port 4000, Swagger at `/api/docs`) |
| `packages/shared` | Roles, constants and Zod schemas shared by both apps |
| `packages/tsconfig` | Base TypeScript config |
| `plans/` | Test plan PDF and `PROJECT_PLAN.md` |

## Setup

Requirements:
- Node 20 or newer.
- pnpm 11.
- A local PostgreSQL install. Docker isn't needed.

1. Create the database: `CREATE DATABASE mindease;`
2. Copy `apps/api/.env.example` to `apps/api/.env`.
3. In that file, set `DATABASE_URL` and `JWT_ACCESS_SECRET`.
4. Install, migrate and seed:
   ```sh
   pnpm install
   pnpm db:migrate     # apply migrations
   pnpm db:seed        # admin (SEED_ADMIN_* in .env), hotlines, FAQs, articles, demo doctors and patient
   pnpm dev            # web on :3000, api on :4000
   ```

The browser only talks to `localhost:3000`. Next.js forwards `/api/*` to the API.

Default admin: `admin@mindease.local` / `Admin12345`. Demo doctors (development only): `sarah.ahmed@demo.mindease.local`, `tanvir.hasan@demo.mindease.local` and `nusrat.jahan@demo.mindease.local`, all with password `Doctor12345`, open Sunday–Thursday 10:00–13:00 and 15:00–18:00. Demo Premium patient (development only, so booking can be tried before payments exist): `patient@demo.mindease.local` / `Patient12345`. Change these before seeding anywhere real.

## Email (optional, Gmail SMTP)
Without SMTP settings, emails are written to the API log instead of being sent. To send real email from a Gmail account:

1. In your Google Account, open **Security** and turn on **2-Step Verification**.
2. Open **Security → App passwords** (or search "App passwords"), create one named "MindEase", and copy the 16-character password.
3. In `apps/api/.env` set:
   ```
   SMTP_USER=your.address@gmail.com
   SMTP_PASS=abcdefghijklmnop        # the App Password, without spaces
   MAIL_FROM="MindEase Oasis <your.address@gmail.com>"
   ```
4. Restart `pnpm dev`. The API log shows `SMTP ready`, or `SMTP login failed` if the password is wrong.

Emails sent: email verification, doctor approval or rejection, booking requests (to the doctor), confirmations, declines and cancellations, the 15-minute reminder, expired requests, and contact-form receipts. A personal Gmail account can send about 500 emails a day. Tests never send email.

## Payments (SSLCommerz)
Premium (499 BDT for 30 days) and consultation fees are paid through SSLCommerz hosted checkout (bKash, Nagad, Rocket, cards).

1. Register a free sandbox store at https://developer.sslcommerz.com and note the Store ID and Store Password from the email.
2. In `apps/api/.env` set `SSLCOMMERZ_STORE_ID`, `SSLCOMMERZ_STORE_PASSWORD` and `SSLCOMMERZ_SANDBOX=true`, then restart. The API log shows `SSLCommerz sandbox store …`.
3. On the sandbox payment page, use the test cards or mobile-banking test numbers listed in the SSLCommerz sandbox docs; no real money moves.

Without credentials, a built-in **test checkout** (Pay / Fail / Cancel buttons) is used instead, outside production only. Automated tests always use it.

- **Holds:** a booking holds its slot for 15 minutes while the patient pays. Unpaid holds are released automatically.
- **Refunds:** if a paid booking is declined, cancelled by either side, or expires, the payment becomes "Refund due". An admin sends the money back from the SSLCommerz merchant panel, then marks it refunded at `/admin/payments` (audited).

## Scripts (from the repo root)

| Command | |
|---|---|
| `pnpm dev` | Run everything in watch mode |
| `pnpm build` | Production build |
| `pnpm lint` / `pnpm typecheck` | Static checks |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm --filter api test:e2e` | API end-to-end tests. They use the DB in `.env` and clean up after themselves |
| `pnpm db:studio` | Browse the database |

## Roles

| Role | Lands on | Notes |
|---|---|---|
| Guest | `/` | No account |
| `USER` | `/dashboard` | Free or paid tier, from the subscription |
| `DOCTOR` | `/doctor` | Hidden from patients until an admin verifies them |
| `ADMIN` | `/admin` | Seeded only. Cannot self-register |

The API enforces access with `@Roles()` and global guards. `apps/web/src/proxy.ts` only redirects people to the right area.
