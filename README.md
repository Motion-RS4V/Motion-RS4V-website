# Motion RS4V

Booking site and venue console for Motion RS4V, a remote-driven FPV car circuit at Zora The Mall, Raipur.

**Stack:** Next.js 16 · TypeScript · Supabase (Postgres, Auth) · Prisma 7 · Razorpay · Resend (email)

## Setup

1. `npm install`
2. Create `.env.local` with the Supabase URL, keys and both connection strings. Ask the project owner for the values.
3. `npm run db:deploy` applies the migrations.
4. `npm run db:seed` loads default settings, the two experiences, 4 rigs, sample cars and test logins.
5. `npm run dev` starts the site at http://localhost:3000

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the local site |
| `npm run typecheck` | Type-check everything |
| `npm test` | Run unit tests |
| `npm run test:db` | Run the booking engine against the real database (creates and deletes test bookings in 2099) |
| `npm run lint` | Lint |
| `npm run db:migrate` | Create and apply a migration after editing `prisma/schema.prisma` |
| `npm run db:seed` | Seed defaults. Safe to re-run; never overwrites owner changes |
| `npm run db:check-rls` | Fail if any table is readable through Supabase's public API |
| `npm run db:studio` | Browse the database |

## Rules that keep the system honest

- **No business values in code.** Price, hours, slot length, capacity and policy windows live in the `settings` table (`src/server/settings`) and are edited from the owner console.
- **Availability is decided on the server,** inside the booking transaction, never trusted from the browser.
- **Customers book an experience, not a car.** Staff assign cars at check-in.
- **Payments are always re-checked with Razorpay on the server;** the browser's word is never trusted.
- **Manage links are the only way customers change bookings.** Tokens are stored hashed; Find My Booking emails links to the address on the booking.
- **Staff console:** two roles (Owner, Staff). Cars and rigs are assigned automatically at check-in, with a staff override; every desk action is written to the audit log.
- **Every new table keeps row-level security on.** Run `npm run db:check-rls` after each migration.
- **Money is in paise; times are stored in UTC** and shown in the venue's timezone.

## Layout

```
prisma/schema.prisma      database schema
prisma/migrations/        SQL migrations
prisma/seed.ts            idempotent seed
scripts/                  standalone checks (import ./load-env first)
src/server/env.ts         validated server environment
src/server/db.ts          Prisma client (Supabase transaction pooler)
src/server/settings/      settings schemas, defaults, loader, update + audit
src/server/booking/       booking engine: slots, pricing, capacity, policy, create/confirm/cancel/reschedule, jobs
src/server/supabase/      Supabase admin client (server only)
src/server/site/          public page content from settings (server only)
src/server/payments/      Razorpay client, checkout, payment finalisation, refunds, booking emails
src/server/email/         email templates, providers (resend | console | ses later), send log + retries
src/server/manage/        private manage links (hashed tokens), manage view, cancel/move, Find My Booking
src/server/staff/         staff session + roles, today board, auto rig/car assignment, desk operations
src/proxy.ts              refreshes the staff login session on /staff requests
src/lib/                  browser-safe helpers and shared public types
src/components/site/      public site sections (one component + CSS module each)
src/app/api/availability/ live sessions for a date (never cached)
src/app/api/checkout/     hold seats + Razorpay order; /verify confirms; /release frees an unpaid hold
src/app/api/razorpay/     webhook (needs RAZORPAY_WEBHOOK_SECRET and a public URL)
src/app/api/manage/       cancel (GET preview, POST) and reschedule for a manage link
src/app/api/jobs/tick     housekeeping for a scheduler: expire holds, no-shows, completed sessions, email retries
src/app/staff/            venue console: login, board, booking detail, walk-ins, fleet, blocks
src/app/api/staff/        console login/logout, search and one endpoint for all desk actions
src/app/                  Next.js routes
public/media/             trimmed clips, posters and venue images
```
