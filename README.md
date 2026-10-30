# CatalogLink

One live catalog link for every textile wholesaler, built from their own Google Sheet and Google Drive images. Customers open the link on their phone, add products to the cart and place orders. The wholesaler manages orders on a dashboard and keeps stock in the same sheet.

> **Status:** MVP (Phase 1) is in progress and is being built one milestone at a time. See [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md) for the architecture and the milestone checklist. Some commands below only work once the matching milestone is done; this is noted where it applies.

---

## Tech stack

| Layer | Choice | Version |
|---|---|---|
| Runtime | Node.js | 24 LTS (22 LTS also supported) |
| Package manager | pnpm workspaces | pnpm 12 |
| Web app + API | Next.js (App Router, TypeScript) | 16.x |
| UI | React + Tailwind CSS | React 19, Tailwind 4 |
| ORM | Prisma (`prisma`, `@prisma/client`, `@prisma/adapter-pg`) | **7.10.1** |
| Database | PostgreSQL | 16+ |
| Queue / cache | Redis + BullMQ | Redis 7, BullMQ 6 |
| Google | `googleapis` (Sheets + Drive) | latest |
| OTP | MSG91 (console stub for development) | — |

The exact versions are pinned in the `package.json` files and `pnpm-lock.yaml`. TypeScript is pinned to 5.9.3, because TypeScript 7 (the native compiler) is not yet supported by the Next.js and Prisma tooling.

> **Notifications are on hold.** Email and WhatsApp notifications (§11 of the requirements) are not part of the current build and will be added later, so there is no SMTP configuration yet.

---

## Repository layout

```
.
├── apps/
│   ├── web/             # Next.js: Super Admin (/admin), Client dashboard (/app),
│   │                    #          public catalog (/c/[slug]), API route handlers (/api/v1)
│   └── worker/          # Node + BullMQ: sheet sync, image thumbnails, Orders-tab writer, cron
├── packages/
│   ├── db/              # Prisma schema, migrations, seed, Prisma client
│   ├── core/            # Shared services: env, auth, OTP, Redis, queues (+ Google, sync, PDF… later)
│   └── validation/      # Zod schemas shared by forms, server actions and route handlers
├── sheet-template/      # Downloadable Google Sheet template for clients
├── docs/
│   └── IMPLEMENTATION.md
├── secrets/             # Local-only secrets such as google-sa.json (git-ignored)
├── docker-compose.yml   # postgres, redis for local development
└── .env.example
```

---

## Prerequisites

- **Node.js 24 LTS** (or 22 LTS): `node -v`
- **pnpm 12**: `npm install -g pnpm@12` (or `corepack enable` on Node 24)
- **PostgreSQL 16+** and **Redis 7+**, either through Docker (option A) or installed locally (option B)
- A **Google Cloud** project (see [Google Cloud setup](#google-cloud-setup))
- An **MSG91** account. This is only needed for real SMS OTP; development uses the console stub.

---

## Quick start

```bash
# 1. Install dependencies
pnpm install

# 2. Environment
cp .env.example .env
#    Fill in SESSION_SECRET, ENCRYPTION_KEY, INTERNAL_API_SECRET:
openssl rand -base64 32   # run once per secret

# 3. Start Postgres + Redis, see options below
docker compose up -d postgres redis

# 4. Database
pnpm db:generate          # generate the Prisma client
pnpm db:migrate           # apply migrations (dev)
pnpm db:seed              # create the Super Admin from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD

# 5. Run web + worker together
pnpm dev
```

| URL | What |
|---|---|
| http://localhost:3000/login | Login (Super Admin and Client) |
| http://localhost:3000/admin | Super Admin panel |
| http://localhost:3000/app | Client dashboard |
| http://localhost:3000/c/&lt;slug&gt; | Public catalog link |
| http://localhost:3000/api/health | Health check: database, Redis and worker heartbeat |

With `OTP_PROVIDER=console`, OTP codes are printed in the `pnpm dev` terminal instead of being sent by SMS.

### Option A — Postgres and Redis with Docker

```bash
docker compose up -d postgres redis
```

The compose file creates the database `cataloglink` with user and password `cataloglink`, which matches `DATABASE_URL` in `.env.example`.

### Option B — Postgres and Redis installed locally

```bash
# Create the database user (CREATEDB lets `pnpm test:db` create cataloglink_test)
sudo -u postgres psql -c "CREATE ROLE cataloglink WITH LOGIN CREATEDB PASSWORD 'cataloglink';"
sudo -u postgres createdb -O cataloglink cataloglink

# Check the login works
PGPASSWORD=cataloglink psql -h localhost -U cataloglink -d cataloglink -c "select 1"

# Make sure Redis is running
redis-cli ping            # -> PONG
```

Postgres 14+ and Redis 6+ work for local development; production should use Postgres 16 and Redis 7.

---

## Environment variables

All variables in [.env.example](.env.example) are required. Optional tuning values have defaults in code.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection, used for queues, cache and rate limits |
| `APP_URL` | Public base URL; used for catalog links, QR codes and the OAuth redirect `${APP_URL}/api/v1/google/oauth/callback` |
| `SESSION_SECRET` | Signs session JWT cookies |
| `ENCRYPTION_KEY` | 32-byte base64 key; encrypts stored Google OAuth refresh tokens |
| `INTERNAL_API_SECRET` | Shared secret for worker → web cache revalidation |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth client for "Connect Google account" |
| `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` | Path to the service account JSON key |
| `OTP_PROVIDER` | `console` (development) or `msg91` |
| `MSG91_AUTH_KEY` / `MSG91_OTP_TEMPLATE_ID` | MSG91 credentials; required when `OTP_PROVIDER=msg91` |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | First Super Admin, created by `pnpm db:seed` |
| `GOOGLE_FAKE_DIR` *(optional, development only)* | Local demo Google data, see [Try the sheet sync without Google](#try-the-sheet-sync-without-google). Ignored in production. |

Never commit `.env` or anything in `secrets/`.

---

## Try the sheet sync without Google

Until Google credentials are configured, the sync can be tried with local demo data:

1. Add `GOOGLE_FAKE_DIR=./dev-fixtures/google` to `.env` and restart `pnpm dev`.
2. Log in as a client (or use "Login as client" from Super Admin), open **Google Sheet**, choose option B and paste
   `https://docs.google.com/spreadsheets/d/DEMO_shree_krishna_textiles_sheet/edit`.
3. Pick the **Products** tab. The sync imports 5 products, reports 3 rows with deliberate mistakes, and the worker makes thumbnails.

Only IDs starting with `DEMO_` (sheets) or `demo-` (Drive files/folders) are served from the fixtures; real sheets keep using Google, so the setting can stay on in development. Regenerate the data with `pnpm --filter @cataloglink/core dev:fixtures`.

### Dummy products in one command

```bash
pnpm demo:data                  # creates "Shree Krishna Textiles (Demo)" with 34 products, photos and 3 custom links
pnpm demo:data --client <slug>  # loads the same products into an existing client instead
```

The script syncs the sample sheet `DEMO_catalog_sample_products` through the real sync and thumbnail code (no worker or Google account needed) and prints the login: `demo@cataloglink.local` / `Demo@12345`.
- The sample sheet covers sarees, kurtis, lehengas, gowns, suits, dress material and dupattas in 5 catalogs. It includes out-of-stock, low-stock, "New Arrival" and `Active = No` rows.
- Running it again is safe: it re-syncs instead of duplicating.
- It refuses a client connected to a real Google Sheet.
- Keep `GOOGLE_FAKE_DIR` set so the worker's automatic syncs of the demo sheet keep working. Without it they fail, and the products stay as they are.

## Google Cloud setup

Clients can connect a sheet in two ways, and both need setup in the same Google Cloud project.

### 1. Project and APIs
1. Open https://console.cloud.google.com and create a project (e.g. `cataloglink`).
2. Go to **APIs & Services → Library** and enable **Google Sheets API** and **Google Drive API**.

### 2. Service account (the "share the sheet with us" flow)
1. Go to **IAM & Admin → Service Accounts → Create service account** (e.g. `cataloglink-sync`). It needs no project roles.
2. Open the account and go to **Keys → Add key → JSON**. Save the file as `secrets/google-sa.json`.
3. The service account's email (`…@<project>.iam.gserviceaccount.com`) is shown to clients in the dashboard. A client shares:
   - **the sheet** with that email as **Editor** (Editor is needed to write the `Orders` tab)
   - **the Drive image folder(s)** with that email as **Viewer**

### 3. OAuth client (the "Connect Google account" flow)
1. Configure **APIs & Services → OAuth consent screen**:
   - User type **External**, with the app name, support email and logo.
   - Scopes: `https://www.googleapis.com/auth/spreadsheets` and `https://www.googleapis.com/auth/drive.readonly`.
   - While the app is in **Testing**, add each client's Google email under **Test users** (up to 100).
2. Go to **Credentials → Create credentials → OAuth client ID** and choose type **Web application**.
   - Authorised redirect URI: `http://localhost:3000/api/v1/google/oauth/callback` (add the production URL later).
   - Copy the client ID and secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

> **Production note:** `spreadsheets` is a *sensitive* scope and `drive.readonly` is a *restricted* scope. Publishing the OAuth app to all users needs Google verification, and restricted scopes also need a third-party security assessment. Until that is done, use Testing mode for pilot clients, or have clients use the service-account flow, which needs no verification. See [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md#google-connect).

---

## MSG91 setup (SMS OTP)

For development, keep `OTP_PROVIDER=console`.

For real SMS:
1. Create an MSG91 account and copy the **Auth Key** into `MSG91_AUTH_KEY`.
2. Complete **DLT registration** (required for SMS in India): register the entity and the sender ID, and get the OTP message template approved.
3. In MSG91, create an **OTP template** linked to the DLT template, using the `##OTP##` variable. Copy its ID into `MSG91_OTP_TEMPLATE_ID`.
4. Set `OTP_PROVIDER=msg91`.

---

## Scripts

Run these from the repository root. They become available as milestones land.

| Command | What it does |
|---|---|
| `pnpm dev` | Run web (`:3000`) and worker in watch mode |
| `pnpm --filter @cataloglink/web dev` / `pnpm --filter @cataloglink/worker dev` | Run only one app |
| `pnpm build` | Production build of all apps |
| `pnpm start` | Start the production builds |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript checks |
| `pnpm test` | Unit tests (Vitest); needs Redis but no database |
| `pnpm test:db` | Database tests against `<database>_test` (migrations applied automatically; never wiped) |
| `pnpm test:e2e` | Playwright end-to-end tests (Milestone 8) |
| `pnpm db:generate` | Generate the Prisma client |
| `pnpm db:migrate` | Create/apply migrations in development (`prisma migrate dev`) |
| `pnpm db:deploy` | Apply migrations in production (`prisma migrate deploy`) |
| `pnpm db:seed` | Seed the Super Admin and the default plan |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm --filter @cataloglink/core build:template` | Rebuild `sheet-template/CatalogLink_Template.xlsx` |
| `pnpm --filter @cataloglink/core dev:fixtures` | Rebuild the demo Google data in `dev-fixtures/google` |
| `pnpm demo:data [--client <slug>]` | Load dummy products, photos and links (development only), see [Dummy products](#dummy-products-in-one-command) |

---

## Prisma 7 notes

Prisma 7 changed several defaults compared with Prisma 5/6:

- The database URL is set in **`packages/db/prisma.config.ts`**, not in `schema.prisma`.
- The generator is `provider = "prisma-client"` with an explicit `output` path, and the generated client is imported from that path, not from `@prisma/client`.
- The client connects through the **`@prisma/adapter-pg`** driver adapter.
- `.env` is **not** loaded automatically; `prisma.config.ts` and the apps load it with `dotenv`.
- Pin `prisma` and `@prisma/client` to the **same** version. On npm, `prisma@latest` currently points to an 8.0 release candidate, so always install `prisma@7.10.1` explicitly.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Can't reach database server` | Check that Postgres is running and that `DATABASE_URL` is correct (`psql "$DATABASE_URL" -c 'select 1'`). |
| Prisma client is missing or out of date | Run `pnpm db:generate` after changing the schema or pulling new code. |
| Jobs never run (sync stays "queued") | Check that the worker is running and that `redis-cli ping` returns `PONG`. |
| Sync stays "Syncing…" | The worker isn't running (`pnpm dev` starts it), or Redis is down. A sync stuck for 15 minutes is marked failed and retried automatically. |
| Google `403 The caller does not have permission` | The sheet or Drive folder isn't shared with the service account email, or the OAuth user is not a test user. |
| Google `invalid_grant` | The client revoked access, or the OAuth token expired while the app was in Testing mode (7 days). Reconnect the Google account. |
| `redirect_uri_mismatch` | The redirect URI in Google Cloud must exactly match `${APP_URL}/api/v1/google/oauth/callback`. |
| No OTP SMS | With `OTP_PROVIDER=console`, read the code from the terminal. With MSG91, check the DLT template approval and the template ID. |
| `password authentication failed for user "cataloglink"` | The role doesn't exist or has another password. Check the Postgres log (`/var/log/postgresql/postgresql-*-main.log`) for `Role "cataloglink" does not exist`, then run the Option B commands. |
| `pnpm install` lists "Ignored build scripts" | Run `pnpm approve-builds <package>` for the package; the approved list lives under `allowBuilds` in `pnpm-workspace.yaml`. |

---

## Further reading

- [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md): architecture, data model, sync, checkout, order flow, milestone checklist
- The requirements document in the project root: `Textile Wholesale Catalog Link – Requirement & Feature Document.pdf`
