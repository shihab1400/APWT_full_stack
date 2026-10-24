# MindEase Oasis — Implementation Plan

## Context
The PDF (`plans/SQT-ProjectFinalDraft.pdf`) is the Software Test Plan for **MindEase Oasis**: an AI + expert mental-health support platform for Bangladesh. Its section 4 holds the requirements; the rest is testing material. This plan turns those requirements into a buildable monorepo:

- **Frontend:** Next.js (App Router, TypeScript, Tailwind)
- **Backend:** NestJS (TypeScript)
- **DB:** PostgreSQL
- **Auth:** role-based (RBAC)
- **AI:** Google AI Studio (Gemini API)
- **Layout:** monorepo

On approval, this file is copied to `plans/PROJECT_PLAN.md` in the repo.

## Roles (RBAC)
| Role | Access |
|---|---|
| `GUEST` (no login) | Home, doctor list (no booking), blogs, FAQ, pricing, emergency hotlines, policies, contact form, register |
| `USER_FREE` | Dashboard, self-assessment, AI chat with a daily message cap, upgrade flow |
| `USER_PAID` | Unlimited AI chat, book and pay for appointments, ratings and reviews, chat and test history |
| `DOCTOR` | Profile and credential upload (hidden until verified), weekly availability, accept or decline bookings, patient details, consultation notes, earnings, notifications |
| `ADMIN` | Doctor approval, user/doctor management, payments monitor, risk alerts, appointments master view, quiz CRUD, review moderation, audit log |

Free vs. paid is a `subscription` state on the user, not a separate role. `JwtAuthGuard` + `RolesGuard` + `@Roles()` enforce roles in Nest. Next.js `proxy.ts` (Next 16's renamed middleware) handles route-level redirects only. The backend remains the source of truth.

## Monorepo layout
Tooling: **pnpm workspaces + Turborepo**.

```
mindease-oasis/
├─ apps/
│  ├─ web/            # Next.js (App Router)
│  └─ api/            # NestJS
├─ packages/
│  ├─ shared/         # Zod schemas, DTO types, enums (Role, ApptStatus...), constants
│  ├─ (lint: oxlint in api, eslint-config-next in web)
│  └─ tsconfig/
├─ (no Docker: uses your local PostgreSQL via DATABASE_URL)
├─ turbo.json  pnpm-workspace.yaml  .env.example
└─ plans/
```

`packages/shared` is the contract between web and api: roles, enums, and validation schemas are defined once.

## Backend (apps/api) — NestJS modules
ORM: **Prisma** (migrations, typed client). Validation: `class-validator` and shared Zod. Docs: `@nestjs/swagger` (the PDF asks for clear API docs).

| Module | Responsibility (PDF item #) |
|---|---|
| `auth` | Register, login, JWT access + refresh tokens, argon2/bcrypt hashing, email verification, duplicate-email check (#1, #12, #37) |
| `users` | Profile, privacy settings, data-collection consent (#11) |
| `subscriptions` | Free/paid state, upgrade via payment, activate paid features (#15) |
| `chat` | Gemini chat, session and history storage, free-tier daily cap, high-risk keyword detection (#2, #14, #16) |
| `ai` | Thin Gemini wrapper (`@google/genai`), system prompt, safety settings, timeout/retry |
| `assessment` | Quiz, instant scoring, risk level, high-risk threshold, doctor recommendation (#4, #22) |
| `risk` | Risk alert log (severity, whether the user booked a doctor) (#20) |
| `doctors` | Profile, credential upload, approval workflow, verified toggle, public listing (#25, #17, #35) |
| `availability` | Weekly slots, block/open, reject out-of-hours booking (#26) |
| `appointments` | Book online (text chat) or offline session, accept/decline with reason, cancel, master view (#5, #27, #21) |
| `payments` | Gateway integration, fee-cap validation, confirmation, admin transaction ledger, atomic rollback (#6, #7, #19) |
| `reviews` | Stars and comments, moderation queue, flag/hide (#3, #23) |
| `consultations` | Doctor notes (assigned doctor only, timestamped), patient history, and patient–doctor text messaging per appointment (#28, #29, #30) |
| `notifications` | In-app real-time (WebSocket gateway), 15-min reminder cron (`@nestjs/schedule`) (#32) |
| `content` | Blogs, FAQ, pricing, policies, hotlines (public) (#34, #36, #39, #40) |
| `contact` | Public support form with confirmation (#16) |
| `admin` | User management, deactivate, audit log with admin ID and timestamp (#18, #24) |
| `files` | Credential uploads (local disk in dev, S3-compatible in prod) |

Cross-cutting: global exception filter, Helmet, CORS allow-list, rate limiting (`@nestjs/throttler`), and an audit interceptor that records admin actions.

### Key design decisions
- **Gemini integration:** model `gemini-2.5-flash` (low latency, matching the 2-second target). Stream responses over SSE. Keep the API key server-side only. The system prompt makes the model an empathetic support companion that never diagnoses and always suggests a professional for serious concerns.
- **Crisis safety:** run a keyword/risk pre-check on every message. On a hit, return the hotline card, write a `RiskAlert`, and still respond supportively. Do not depend on the LLM alone.
- **Payments:** the PDF names SSLCommerz or bKash. Start with an **SSLCommerz sandbox** behind a `PaymentProvider` interface so it can be swapped. All payments go to the admin account. Booking and payment run in one `prisma.$transaction`, with a pending state and webhook reconciliation, so a failure rolls back (NFR #6). Reject amounts above the doctor's fee.
- **Consultations:** no audio/video. Online sessions are text-only: a per-appointment message thread between patient and doctor, delivered in real time over the same WebSocket gateway used for notifications, with history stored in the DB. Offline sessions are in-person.
- **Encryption:** TLS in transit. PII and notes are encrypted at rest with an AES-256-GCM column-level helper (key in env/KMS). True end-to-end encryption for chat is stated in the PDF but conflicts with server-side AI, so I recommend documenting it as encryption in transit and at rest.
- **Low bandwidth:** Next.js server components, minimal client JS, image optimisation, HTTP caching on public content.

### Data model (Prisma, main tables)
`User(id, email, passwordHash, role, status, emailVerified, consentAt)`, `Subscription`, `DoctorProfile(userId, specialization, bio, licenseUrl, fee, verified, status)`, `AvailabilitySlot`, `Appointment(userId, doctorId, type, start, end, status, declineReason)`, `Payment(appointmentId|subscriptionId, amount, status, gatewayTxnId)`, `ChatSession`, `ChatMessage`, `Quiz`, `QuizQuestion`, `QuizAttempt(score, riskLevel)`, `RiskAlert(userId, severity, followedUp)`, `Review(status: visible/flagged/hidden)`, `ConsultationNote`, `Notification`, `BlogPost`, `Faq`, `ContactMessage`, `AuditLog(adminId, action, target, reason, createdAt)`, `RefreshToken`.

## Frontend (apps/web) — Next.js
- App Router with route groups: `(public)`, `(auth)`, `(user)`, `(doctor)`, `(admin)`. Each group has its own layout and nav.
- Data access: a typed API client from `packages/shared` + TanStack Query for client-side state. Server components fetch public content.
- Auth: httpOnly access + refresh cookies; Next rewrites `/api/*` to Nest so cookies are first-party. `proxy.ts` redirects by role to `/dashboard` (user), `/doctor`, `/admin`.
- UI: Tailwind + shadcn/ui, calm palette, accessible components (WCAG AA), responsive.
- Key screens: Home, Login/Register, Doctor directory/profile, Blog/FAQ/Pricing/Policies/Contact/Emergency, Assessment, Chat (streaming), Booking + payment, User dashboard, Doctor dashboard (calendar, requests, patients, notes, earnings), Admin dashboard (approvals, users, payments, risk alerts, appointments, quiz CRUD, reviews, audit log).

## Phases
1. ✅ **Foundation (done 2026-10-24):** monorepo scaffold, local PostgreSQL database `mindease`, Prisma schema + migrations, `shared` package, auth + RBAC, CI (lint, typecheck, test).
2. ✅ **Public + content (done 2026-10-24):** guest pages, blogs/FAQ/pricing/policies/hotlines, contact form.
3. ✅ **Assessment + AI chat (done 2026-10-24):** quiz engine and scoring, Gemini streaming chat, daily cap, risk detection and alerts.
4. ✅ **Doctors + booking (done 2026-10-24):** registration, admin approval, availability, appointments, notifications and reminders.
5. **Payments + subscription:** SSLCommerz sandbox, upgrade flow, fee cap, transaction rollback, admin ledger.
6. **Doctor tools + admin:** consultation notes, earnings, reviews and moderation, user management, audit log, quiz CRUD.
7. **Text messaging:** per-appointment patient–doctor chat (WebSocket), message history, unread badges.
8. **Hardening:** encryption at rest, rate limits, tests, performance pass, deployment (Vercel/Render or a VPS), daily `pg_dump` backup job.

## Testing (aligned with the PDF's levels)
- Unit: Vitest in `api` (Nest 12 default) (scoring, fee cap, RBAC guards, risk detection) and Vitest in `web`.
- Integration: Supertest against a test Postgres (booking + payment transaction, auth flows).
- System/E2E: Playwright for the main journeys per role. Third-party gateways and Gemini are mocked, in line with the PDF's "features not to be tested".

## Out of scope / simplifications (to confirm)
- True E2E-encrypted chat, audio/video calls, HIPAA certification, microservices (use a modular monolith), 10,000-concurrent scaling and off-site backup infrastructure. These are designed for but not delivered in the first build.

## Verification
- `pnpm dev` starts web (3000) and api (4000) against your local PostgreSQL; `/api/docs` shows Swagger.
- Register as each role and confirm the redirect to the right dashboard. Confirm that cross-role API calls return 403.
- Take the quiz above the threshold: it recommends a doctor and creates a RiskAlert. Send a crisis keyword in chat: the hotline card appears and an alert is logged.
- Free user hits the daily cap: the upgrade prompt appears. Sandbox payment activates paid features.
- Book outside doctor hours: error. Force a payment failure: no appointment is left behind.
- `pnpm test` and `pnpm e2e` pass.

## Phase 1 implementation notes (2026-10-24)
Versions actually installed: Next.js 16.4, React 19.3, NestJS 12 (ESM, Vitest, oxlint), Prisma 7.10 (`prisma-client` generator + `@prisma/adapter-pg`, URL in `prisma.config.ts`), TypeScript 6, Zod 4, Turborepo 2.11, pnpm 11.

- **Data model:** the full schema is migrated (`init`), including `ConsultationMessage(appointmentId, senderId, body, readAt)` for text consultations. `Appointment.type` is `ONLINE` (text chat) or `OFFLINE`.
- **Stored roles:** `USER | DOCTOR | ADMIN`. Free vs. paid is computed from an active `PAID` `Subscription` and carried in the JWT as `tier`.
- **Auth:**
  - Access JWT (15 min) plus an opaque refresh token (7 days). Only the refresh token's SHA-256 hash is stored, and it rotates on every refresh. Reusing a revoked token revokes all of that user's sessions.
  - bcryptjs, cost 12.
  - The global `JwtAuthGuard` checks the account status in the DB on every request, so a deactivation takes effect immediately.
  - Doctors self-register with a `PENDING` profile. Admins come from the seed only.
- **Validation:** shared Zod schemas validate both the web forms and the API (`ZodValidationPipe`). Swagger body schemas are generated from the same Zod schemas.
- **Admin:** `GET /api/admin/users`, `PATCH /api/admin/users/:id/status` (requires a reason; writes `AuditLog`).
- **Email verification:** the link is logged to the API console until email delivery is added.
- **Tests:**
  - api unit (RolesGuard, AuthService), 16 tests.
  - api e2e against local Postgres (auth, RBAC 403s, refresh reuse, deactivation), 8 tests.
  - web proxy redirects, 12 tests.

## Phase 2 implementation notes (2026-10-24)
- **Migration `public_content`:**
  - `Faq.category` and `Faq.published`.
  - A new `Hotline` table.
  - `BlogPost.category`.
  - `DoctorProfile.experienceYears`.
- **Public API, no login needed:**
  - `GET /api/content/blogs[?category]`
  - `GET /api/content/blogs/:slug`
  - `GET /api/content/faqs` (grouped by category)
  - `GET /api/content/hotlines`
  - `GET /api/content/pricing` (plans plus the live doctor-fee range)
  - `GET /api/doctors[?q&specialization]`
  - `GET /api/doctors/specializations`
  - `GET /api/doctors/:id`
  - `POST /api/contact` (5 requests/min; returns a reference such as `ME-1A2B3C4D`)
- **Public API details:**
  - The content endpoints send `Cache-Control: public, max-age=60`.
  - The doctor directory returns only approved, verified, active doctors, and only their public fields.
- **Admin:** `GET /api/admin/contact-messages`, plus `PATCH /api/admin/contact-messages/:id` to mark a message handled (audited). The UI is at `/admin/inbox`.
- **Web `(public)` route group:**
  - Pages: home, `/doctors`, `/doctors/[id]`, `/resources`, `/resources/[slug]`, `/faq`, `/pricing`, `/emergency`, `/privacy`, `/terms`, `/contact`.
  - Each page is a static shell plus a server component that streams in the data inside `<Suspense>`, so the build doesn't need the API.
  - Filters are plain GET forms and the FAQ uses `<details>`, so neither needs client JavaScript (helps on low bandwidth).
  - The hotlines fall back to a built-in 999 entry when the API is unreachable.
- **Seed:** hotlines, 10 FAQs in 4 categories, 4 articles, and 3 fictional demo doctors (development only, password `Doctor12345`).
- **Price:** the paid plan costs `PAID_PLAN_MONTHLY_PRICE` = 499 BDT/month (`packages/shared/src/constants.ts`). This is a placeholder for the team to confirm.
- **Not yet true:** the privacy policy describes the target system. Encryption at rest and daily backups are delivered in phase 8.

## Phase 3 implementation notes (2026-10-24)
- **Migration `assessment_and_chat`:**
  - `Quiz.slug` and `Quiz.moderateRiskScore`.
  - `QuizQuestion.critical`.
  - `QuizAttempt.maxScore` and `QuizAttempt.critical`.
  - `RiskAlert.sourceId`.
- **Assessments:**
  - **Questionnaires:** PHQ-9 (mood) and GAD-7 (anxiety) are seeded. Both are free-to-use screening tools.
  - **Thresholds:** moderate at 10 or more, high at 15 or more. 15 matches FR_3.
  - **Self-harm item:** PHQ-9 item 9 is marked `critical`, so any non-zero answer makes the result HIGH.
  - **Scoring:** done on the server (`assessment/scoring.ts`); option scores are never sent to the browser. Thresholds are read at submit time, so admin changes apply to the next attempt.
  - **HIGH result:** creates a `RiskAlert` (source QUIZ) and returns 3 verified doctors to recommend.
- **AI chat:**
  - **Endpoint:** `POST /api/chat/messages` streams Server-Sent Events: `session`, then `crisis` if detected, then repeated `delta`, then `done` or `error`. It works through the Next `/api` rewrite.
  - **Models:** `gemini-3.5-flash` with minimal thinking, falling back in order to `gemini-2.5-flash` and `gemini-3.1-flash-lite`.
  - **No SDK retries:** they are disabled, so a rate-limited model hands over immediately.
  - **Waiting:** up to 15 s for the first chunk.
  - **Configuration:** `GEMINI_MODEL` and `GEMINI_FALLBACK_MODELS`.
  - **Measured speed:** first words in about 1.0–2.9 s through the web proxy.
- **Free-tier API limit:** Google's free tier allows only **5 requests per minute per model**. With 3 models, that is about 15 chat replies per minute across all users. A paid Gemini key is needed for real traffic.
- **Daily limit:** 20 messages per Dhaka calendar day for FREE users (`FREE_DAILY_CHAT_LIMIT`). Going over returns `429` with `code: CHAT_LIMIT_REACHED`. A crisis message is **never** blocked: it gets a fixed safety reply plus hotlines.
- **Crisis detection:** a keyword screen in English, Romanised Bangla and Bangla script (`risk/crisis-detector.ts`) runs before the model. On a match:
  - the message is flagged;
  - a `RiskAlert` is created (source CHAT, severity HIGH);
  - the hotline card is streamed to the user;
  - the AI still replies.
- **Safe fallback:** if every model fails, the user gets a fixed message pointing to the hotlines and doctors instead of an error.
- **Web pages:**
  - `/dashboard/chat`: conversation list, streaming replies, inline crisis card, count of messages left, upgrade prompt.
  - `/dashboard/assessment`: assessments plus a history of results.
  - `/dashboard/assessment/[id]`: take an assessment and see the result, with doctor cards and the crisis card when relevant.
- **Hotlines:** 999 plus MindEase Emergency Service (01568978234, 24/7, free).
- **Deferred to phase 6:** the admin Risk Alerts tab and the quiz/threshold editing screens (FR_3). The data and API pieces they need are already in place.

## Phase 4 implementation notes (2026-10-24)
- **Migration `doctors_and_booking`:**
  - `DoctorProfile`: `clinicAddress`, `licenseFile` + `licenseMimeType` (replace `licenseUrl`), `submittedAt`, `reviewedAt`.
  - `AvailabilitySlot.blocked` removed; one-off blocks live in the new `AvailabilityBlock` table.
  - `Appointment`: `patientNote`, `cancelReason`, `cancelledById`.
- **Doctor onboarding (FR_9, FR_1):**
  - Statuses: `INCOMPLETE` → `SUBMITTED` → `APPROVED`, or `REJECTED` with a reason, then resubmit.
  - Licence upload: PDF/PNG/JPG up to 5 MB. The type is checked from the file's first bytes, not the browser's claim. Files are stored privately under `UPLOAD_DIR` and only the doctor and admins can open them.
  - A verified licence can't be replaced from the app.
  - Admins see "Doctor approvals" (`/admin/doctors`). Approve and reject are audited (`DOCTOR_APPROVED`, `DOCTOR_REJECTED`) and notify the doctor.
- **Email:** notifications marked as email (approval, rejection) are written to the API log until an email provider is configured.
- **Scheduling (FR_10):**
  - Weekly hours in Dhaka time on a 30-minute grid; sessions are 60 minutes.
  - Doctors block single slots from a 14-day calendar or longer periods ("time off"). A block can't cover an existing request or booking.
  - Patients can book from 1 hour ahead up to 14 days ahead.
  - Booking outside the hours, in a block, or in a taken slot returns `409` with `code: SLOT_UNAVAILABLE` and the message "This time slot is not available".
- **Booking (FR_8, FR_11):**
  - Premium only (`403 PREMIUM_REQUIRED` for free users), checked against the database rather than the token.
  - A booking is a `REQUESTED` appointment; the doctor confirms or declines with a reason. Patients cancel with an optional reason; doctors must give one.
  - Double booking is prevented with a per-doctor PostgreSQL advisory lock inside the booking transaction. The e2e suite fires two simultaneous bookings and checks exactly one wins.
  - In-person sessions are offered only when the doctor has a clinic address.
  - A booking marks the patient's risk alerts as `bookedDoctor` (for the phase 6 Risk Alerts tab).
  - Phase 5 will put payment between choosing a slot and the request reaching the doctor (`PENDING_PAYMENT` already holds the slot).
- **Reminders:** a 1-minute in-process timer sends the 15-minute reminder to both sides once, and cancels requests still unanswered at their start time (patient notified).
- **Notifications:**
  - Stored in `Notification`. `GET /api/notifications/stream` pushes new ones over Server-Sent Events through the Next `/api` rewrite.
  - Streams close after 10 minutes so the client reconnects through the auth guard (refreshing the token if needed).
  - A bell in every dashboard header shows the unread count and refreshes related pages.
  - Fan-out is in-process; running several API instances would need Redis pub/sub.
- **Admin:** `/admin/appointments` lists every appointment with status, type and date-range filters (FR #21).
- **Seed (development only):** demo doctors get Sunday–Thursday hours and two get clinic addresses; a Premium demo patient `patient@demo.mindease.local` / `Patient12345`.

## Email delivery (2026-10-24, between phases 4 and 5)
- **Transport:** Nodemailer over SMTP, configured for Gmail with an App Password (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`). Without credentials, or under `NODE_ENV=test`, emails are logged instead of sent.
- **Behaviour:** sending happens in the background; a failed email is logged and never fails the request. The API checks the SMTP login at startup and logs `SMTP ready` or a warning.
- **Emails:** verification (plus `POST /api/auth/resend-verification` and a "Resend email" button), doctor approved/rejected, booking request to the doctor, confirmed/declined/cancelled, 15-minute reminder, expired request, and the contact-form receipt.
  - The patient's own "request sent" notice stays in-app only.
- **Privacy:** one shared HTML + plain-text template with all user text escaped. Emails carry no assessment, chat or risk data, and not the patient's booking note. The contact receipt echoes nothing the visitor typed, so the form can't relay text to arbitrary addresses.
