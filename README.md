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
   pnpm db:seed        # admin (SEED_ADMIN_* in .env), hotlines, FAQs, articles, demo doctors
   pnpm dev            # web on :3000, api on :4000
   ```

The browser only talks to `localhost:3000`. Next.js forwards `/api/*` to the API.

Default admin: `admin@mindease.local` / `Admin12345`. Demo doctors (development only): `sarah.ahmed@demo.mindease.local`, `tanvir.hasan@demo.mindease.local` and `nusrat.jahan@demo.mindease.local`, all with password `Doctor12345`. Change these before seeding anywhere real.

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
