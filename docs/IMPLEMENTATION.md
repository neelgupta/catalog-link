# CatalogLink — MVP (Phase 1) Implementation Guide

This document describes how the MVP is built: the architecture, the data model, the main flows and the milestone checklist. For setup and running the project, see the [README](../README.md). The product requirements are in `Textile Wholesale Catalog Link – Requirement & Feature Document.pdf`, and section numbers below (§) refer to that document.

**Contents**
1. [Goal and scope](#1-goal-and-scope)
2. [Architecture](#2-architecture)
3. [Monorepo layout](#3-monorepo-layout)
4. [Prisma 7 setup](#4-prisma-7-setup)
5. [Data model](#5-data-model)
6. [Auth and multi-tenancy](#6-auth-and-multi-tenancy)
7. [Google connect](#google-connect)
8. [Sheet sync pipeline](#8-sheet-sync-pipeline)
9. [Image pipeline](#9-image-pipeline)
10. [Public catalog and caching](#10-public-catalog-and-caching)
11. [Cart and checkout](#11-cart-and-checkout)
12. [Order management](#12-order-management)
13. [Notifications](#13-notifications)
14. [Background jobs and cron](#14-background-jobs-and-cron)
15. [Routes and API](#15-routes-and-api)
16. [Testing strategy](#16-testing-strategy)
17. [Deployment notes](#17-deployment-notes)
18. [Milestones and checklist](#18-milestones-and-checklist)

---

## 1. Goal and scope

The MVP covers the full loop **sheet → link → cart → order → stock** (§13). When the requirement sections and the §13 phase table disagree, the phase table decides what is in Phase 1.

| Module | In MVP (Phase 1) | Deferred (Phase 2+) |
|---|---|---|
| Super Admin | Add/edit/activate/deactivate/delete client, auto default link, plans (manual assign, limits, trial, expiry), impersonate, send credentials, dashboard counts, sync error log, plan-expiry reminder, sheet template | Razorpay subscription, usage reports, domain/branding settings |
| Sheet sync | Template, OAuth + service-account connect, auto + manual sync, validation, per-row error log | Column-mapping UI (the MVP uses a fixed header-alias table), variant-wise stock |
| Catalog links | Default link, manual links (by category / catalog name / individual products), WhatsApp share, QR, allow-ordering toggle, show/hide price | Customer-specific price, password/OTP-protected link, expiry, analytics |
| Customer link | Branded header, grid, filters, catalog view, product detail + gallery/zoom + video, variant select, MOQ/qty limit, share product, lazy thumbnails | Wishlist, Hindi/Gujarati, re-order |
| Orders | Cart with GST, OTP checkout, payment-mode display, confirmation + wa.me, "My orders", client order list/detail, statuses, reject with reason, mark paid, PDF slip, Excel export, Orders tab in the sheet | Partial confirm, LR/AWB tracking, online payment |
| Stock | Qty from sheet, out-of-stock badge or hide, cart limit, re-check at checkout | Auto-deduct on confirm, low-stock alert |
| Notifications | **On hold**: not built now and to be added later (see §13). In-app status (dashboard lists, sync status) is still shown. | Email, click-to-WhatsApp, WhatsApp Business API, new-arrival broadcast |
| Staff | Single client login | Staff roles |

**Rules that apply everywhere**
- Every tenant-owned table has a `clientId`, and every query for client data is filtered by it.
- Every server action and route handler starts with an auth guard (`requireSuperAdmin()`, `requireClient()` or `requireCustomer()`).
- A Google API error **never** deletes or hides products (§14, "Sync reliability").
- The Google Sheet's **Available Qty** column is the source of truth for stock (§10).

---

## 2. Architecture

```
                     ┌──────────────────────────────────────────────┐
  Browser            │ apps/web — Next.js 16 (App Router)           │
  (phone/desktop)    │                                              │
  ─────────────────► │  /admin/*   Super Admin   (server components │
                     │  /app/*     Client panel   + server actions) │
                     │  /c/[slug]  Public catalog (SSR + cache)     │
                     │  /api/v1/*  Route handlers (public JSON,     │
                     │             checkout, OTP, OAuth, PDF/XLSX)  │
                     │  proxy.ts   role guard on /admin, /app       │
                     └───────┬───────────────┬──────────────▲───────┘
                             │ Prisma        │ enqueue      │ POST /api/internal/revalidate
                             ▼               ▼              │
                     ┌─────────────┐   ┌──────────┐   ┌─────┴──────────────────────────┐
                     │ PostgreSQL  │◄──┤  Redis   │◄──┤ apps/worker — Node + BullMQ    │
                     │             │   │ queues,  │   │  sync · images · orders-sheet  │
                     └─────────────┘   │ cache,   │   │  · cron (expiry, digests)      │
                             ▲         │ limits   │   └───────┬────────────────────────┘
                             │         └──────────┘           │ googleapis
                             └─── Prisma ─────────────────────┤
                                                              ▼
                                               Google Sheets API · Google Drive API
                     Outbound: MSG91 (OTP SMS). Email/WhatsApp notifications are on hold.
```

- **apps/web** serves every page and the API. Dashboard mutations are **Server Actions**, while anything called by the public catalog, the worker or a download link is a **Route Handler** under `/api`.
- **apps/worker** runs everything that is slow, retryable or scheduled. Next.js request handlers must never call the Google APIs for a full sync.
- **packages/core** holds the business logic, so the web app and the worker run the same code.

---

## 3. Monorepo layout

```
apps/
  web/
    app/
      (auth)/login/                 # email+password and mobile-OTP login
      admin/                        # dashboard, clients, plans, settings
      app/                          # onboarding, dashboard, products, links,
                                    #   customers, orders, profile, settings
      c/[slug]/                     # catalog home, p/[sku], catalog/[name],
                                    #   cart, checkout, orders (My orders)
      api/v1/                       # route handlers (see §15)
      api/internal/revalidate/      # worker → web cache invalidation
    proxy.ts                        # Next.js 16 replacement for middleware.ts
    lib/                            # session, guards, data loaders
    components/
  worker/
    src/
      index.ts                      # starts all workers + repeatable jobs
      jobs/sync.ts  jobs/images.ts  jobs/ordersSheet.ts  jobs/cron.ts
packages/
  db/
    prisma/schema.prisma  prisma/migrations/  prisma/seed.ts
    prisma.config.ts
    src/index.ts                    # Prisma client singleton + tenant helper
  core/
    src/
      env.ts  redis.ts  ratelimit.ts  queues.ts           # Milestone 1
      auth/ (password, session)  otp/ (service, providers) # Milestone 1
      google/ (auth, sheets, drive, links)  sync/ (headers, validate, upsert)
      images/  orders/ (status machine, numbering)  pdf/  excel/  qr/
      plans/  slug/  crypto/
  validation/
    src/                            # zod schemas (client form, link form, checkout, …)
sheet-template/CatalogLink_Template.xlsx
docker-compose.yml                  # postgres, redis, mailpit
```

Each package depends only on the packages below it: `validation` ← `db` ← `core` ← `web` / `worker`.

Workspace packages export TypeScript source directly (no build step). Next.js compiles them through `transpilePackages`, and the worker runs them with `tsx`. Each package exposes subpath exports (e.g. `@cataloglink/core/session`), so `proxy.ts` can import JWT code without pulling in Redis or Prisma. Root scripts use `pnpm -r` / `pnpm --parallel`. Turborepo was dropped in Milestone 1 because turbo 2.11 could not spawn pnpm 12 ("Exec format error").

---

## 4. Prisma 7 setup

Pinned versions: `prisma@7.10.1`, `@prisma/client@7.10.1`, `@prisma/adapter-pg@7.10.1`. `prisma@latest` on npm currently points to an 8.0 release candidate, so do not install it unpinned.

```prisma
// packages/db/prisma/schema.prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"     // no url here in Prisma 7
}
```

```ts
// packages/db/prisma.config.ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  // process.env rather than env(): `prisma generate` must work without a database URL.
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
```

```ts
// packages/db/src/index.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
export const prisma = globalThis.__prisma ?? new PrismaClient({ adapter });
if (process.env.NODE_ENV !== "production") globalThis.__prisma = prisma;
```

This shape was checked against the installed 7.10.1 in Milestone 1. The initial migration (`prisma/migrations/20261029000000_init`) was generated with `prisma migrate diff --from-empty --to-schema`, and later migrations are created normally with `pnpm db:migrate`.

---

## 5. Data model

All IDs are `cuid`/`uuid` strings, all timestamps are `createdAt`/`updatedAt`, and money is `Decimal(12,2)`. Tables marked **T** are tenant-owned (`clientId` + index).

| Table | T | Key fields |
|---|---|---|
| `User` | | `role` (`SUPER_ADMIN`, `CLIENT_OWNER`), `clientId?`, `email` (unique), `mobile`, `passwordHash` (argon2), `isActive`, `lastLoginAt` |
| `Plan` | | `name`, `maxProducts`, `maxCustomLinks`, `maxStaff`, `maxOrdersPerMonth`, `price`, `durationDays`, `isActive` |
| `Client` | | `businessName`, `ownerName`, `mobile`, `email`, `gst?`, `city`, `address`, `logoUrl?`, `bannerUrl?`, `whatsappNumber?` (customer-facing; falls back to `mobile`), `slug` (unique), `status` (`ACTIVE`, `INACTIVE`), `upiId?`, `upiQrUrl?`, `bankDetails` (Json), `paymentModes[]` (`PAY_LATER`, `UPI`, `BANK`), `settings` (Json: `outOfStockMode`, `lowStockThreshold`, `writeOrdersTab`, `syncIntervalMin`, `newArrivalDays`; read through `parseClientSettings`/`getClientSettings`, which fill defaults) |
| `Subscription` | T | `planId`, `startAt`, `expiresAt`, `trialDays`, `status` |
| `SubscriptionPayment` | T | `subscriptionId`, `amount`, `paidAt`, `reference`, `note` |
| `SheetConnection` | T | `mode` (`OAUTH`, `SERVICE_ACCOUNT`), `spreadsheetId`, `sheetName`, `googleEmail?`, `oauthRefreshTokenEnc?`, `lastSyncedAt?`, `lastStatus`, `headerMap` (Json) — one per client |
| `SyncRun` | T | `trigger` (`AUTO`, `MANUAL`), `status` (`RUNNING`, `SUCCESS`, `PARTIAL`, `FAILED`), `startedAt`, `finishedAt`, `rowsTotal`, `rowsAdded`, `rowsUpdated`, `rowsSkipped`, `rowsRemoved`, `errorMessage?` |
| `SyncRowError` | T | `syncRunId`, `rowNumber`, `sku?`, `code` (`MISSING_SKU`, `MISSING_PRICE`, `MISSING_IMAGE`, `DUPLICATE_SKU`, `BAD_NUMBER`, `BAD_IMAGE_LINK`, `PLAN_LIMIT`, …), `message` |
| `Product` | T | `sku` (unique with `clientId`), `name`, `catalogName?`, `category`, `fabric?`, `colours[]`, `sizes[]`, `piecesPerSet?`, `price`, `mrp?`, `priceType` (`PIECE`, `SET`), `moq` (default 1), `availableQty`, `videoUrl?`, `description?`, `gstPct?`, `sheetActive`, `hiddenByClient`, `tags[]`, `rowHash`, `sheetRow`, `firstSeenAt`, `removedFromSheetAt?` |
| `ProductImage` | T | `productId`, `position`, `driveFileId`, `driveModifiedAt?`, `thumbUrl?`, `fullUrl?`, `status` (`PENDING`, `READY`, `FAILED`), `error?` |
| `CatalogLink` | T | `slug` (globally unique), `name`, `isDefault`, `selectionType` (`ALL`, `CATEGORY`, `CATALOG`, `PRODUCTS`), `selectionValues` (Json), `showPrice`, `allowOrdering`, `isActive` |
| `Customer` | T | `name`, `shopName?`, `mobile` (unique with `clientId`), `city?`, `address?`, `gst?`, `isBlocked`, `source` (`ORDER`, `MANUAL`) |
| `CustomerLink` | T | `customerId`, `linkId` |
| `Order` | T | `orderNo` (per-client sequence, e.g. `CL-1042`), `linkId`, `customerId`, `status`, `paymentMode`, `paymentReceived`, `subtotal`, `gstTotal`, `grandTotal`, delivery fields, `transportPref?`, `notes?`, `rejectReason?`, `cancelledBy?`, `sheetWrittenAt?` |
| `OrderItem` | T | `orderId`, `productId`, snapshot fields (`sku`, `name`, `imageUrl`, `colour?`, `size?`, `priceType`, `unitPrice`, `gstPct`, `qty`, `lineTotal`) |
| `OrderStatusHistory` | T | `orderId`, `fromStatus`, `toStatus`, `byUserId?`, `byCustomer`, `note?` |
| `ClientCounter` | T | `nextOrderNo`, incremented inside the checkout transaction |
| `OtpRequest` | | `mobile`, `purpose` (`CLIENT_LOGIN`, `CUSTOMER`), `clientId?`, `codeHash`, `expiresAt`, `attempts`, `consumedAt?` |
| `PlatformSetting` | | `key`, `value` (Json), e.g. the sheet template URL and the default sync interval |

`NotificationTemplate` is not created while notifications are on hold (§13). It will be added in its own migration.

**Visibility of a product on a link:** the product is shown when `sheetActive && !hiddenByClient && removedFromSheetAt == null`, it matches the link's selection, and, if the client chose "hide" for out-of-stock products, `availableQty > 0`.

---

## 6. Auth and multi-tenancy

**Session types**

| Who | How they log in | Cookie | Scope |
|---|---|---|---|
| Super Admin | email + password | `cl_session` | `role=SUPER_ADMIN` |
| Client owner | email + password **or** mobile OTP | `cl_session` | `role=CLIENT_OWNER`, `clientId` |
| Impersonating admin | "Login as client" button | `cl_session` with `imp=<adminUserId>` | the client's scope, plus a banner and an "Exit" action |
| Customer | mobile OTP at checkout or "My orders" | `cl_cust_<clientId>` | `customerId`, `clientId` |

- Sessions are JWTs signed with `SESSION_SECRET` using `jose`, stored as `httpOnly`, `Secure` (in production) and `SameSite=Lax` cookies. Access sessions last 7 days with sliding renewal.
- `proxy.ts` does a cheap check: no valid cookie, or the wrong role, redirects to `/login`. It is **not** the security boundary.
- **The security boundary is the guard calls:** every server action, route handler and data loader calls `requireSuperAdmin()`, `requireClient()` (returns `{ userId, clientId }`) or `requireCustomer(clientId)`.
- **Tenant filter:** client-scoped code gets its database access through `db.forClient(clientId)`, a Prisma client extension that adds `where: { clientId }` to reads and sets `clientId` on creates for tenant tables. Writing tenant data with the plain `prisma` client is limited to the worker and Super Admin code.
- **Client availability:** a client is *available* when `status=ACTIVE` and they have a subscription with `expiresAt > now()`. When a client is unavailable, the public link shows "Catalog not available" and the client dashboard shows a "plan expired" notice, but the client can still log in.
- **OTP rules:** a 6-digit code stored hashed (SHA-256 with a pepper), valid for 5 minutes, 5 verify attempts, and Redis rate limits of 3 sends per mobile per 10 minutes and 20 per IP per hour.
- **Passwords:** argon2id. Super Admin can reset a client's password and send it again.

---

<a id="google-connect"></a>
## 7. Google connect

The two modes share one interface in `packages/core/google`:

```ts
interface SheetSource {
  readValues(spreadsheetId: string, sheetName: string): Promise<string[][]>;
  appendRow(spreadsheetId: string, sheetName: string, row: unknown[]): Promise<void>;
  ensureSheet(spreadsheetId: string, title: string, headers: string[]): Promise<void>;
  drive: DriveSource; // listFolderImages(folderId), downloadFile(fileId), getMeta(fileId)
}
getSheetSource(connection): SheetSource  // picks OAuth or service-account credentials
```

**Client flow: two steps** (`/app/sheet`)
1. **Connect your Google account.**
   - A server action creates a `state` (signed, bound to the session) and redirects to Google with the scopes `spreadsheets` + `drive.readonly`, `access_type=offline` and `prompt=consent`.
   - `GET /api/v1/google/oauth/callback` checks `state`, exchanges the code, encrypts the refresh token (AES-256-GCM with `ENCRYPTION_KEY`) and stores it on `SheetConnection` (`mode = OAUTH`, `googleEmail`).
2. **Paste the Google Sheet link** (`connectSheetByLink` in `core/src/sync/connection.ts`).
   - We open the spreadsheet with the client's own token.
   - The tab is the one the link points at (`#gid=…`, matched against each tab's `sheetId`), otherwise the first tab whose header row has the required columns.
   - A wrong tab or missing columns gets a message naming the tab and the missing columns. A sheet the account can't open gets a "your Google account (email) can't open this spreadsheet" message.
   - The connection is saved and the first sync is queued.

The sheet and the Drive photos in its "Image Links" column (single files or folders) are read with the same OAuth token, by both the sync and the image worker. The client therefore doesn't share anything with CatalogLink, and private Drive photos work.

**Development:** with `GOOGLE_FAKE_DIR` set, step 1 also offers **Use demo Google account** (`connectDemoGoogleAccount`), so step 2 can be tried with the `DEMO_…` fixture sheets without Google sign-in.

**Service account (kept in code, hidden in the UI):**
- `inspectSpreadsheetLink` + `selectSheet(…, "SERVICE_ACCOUNT", …)` and the service-account credentials still work, so existing connections made that way (e.g. the `pnpm demo:data` client) keep syncing.
- The screen no longer offers it. It can come back as a fallback if the OAuth app isn't verified for launch (see below).

**Scope verification risk:** `drive.readonly` is a Google *restricted* scope, so a public OAuth app needs a paid security assessment. For the MVP the OAuth app stays in **Testing** mode (up to 100 test users, and refresh tokens expire after 7 days). Before launch we decide whether to go through verification or switch the OAuth flow to `drive.file` + Google Picker, which is a narrower scope and needs a separate decision.

---

## 8. Sheet sync pipeline

**Triggering**
- **Auto:** a BullMQ repeatable job `sync:tick` runs every minute. It selects available clients with a connection where `lastSyncedAt + syncIntervalMin` (default 5 minutes) has passed, and enqueues a job for each.
- **Manual:** the **Sync now** server action enqueues immediately.
- Jobs use BullMQ deduplication with id `sync:{clientId}`, so a client can never have two syncs queued or running at once. The worker limiter (5 jobs/second across clients, concurrency 3) keeps us inside Google's per-minute quota.

**Steps in one sync job**
1. Create a `SyncRun` with status `RUNNING`.
2. **Read:** one `spreadsheets.values.get` for the whole tab (`FORMATTED_VALUE`). If this or any other Google call fails, mark the run `FAILED`, store the message (shown on the client's sync status page) and **stop without touching products**. The email alert is on hold with the other notifications.
3. **Map headers:** normalise each header (lowercase, trim, remove `₹`, brackets and punctuation) and look it up in the alias table:

   | Field | Accepted headers (examples) |
   |---|---|
   | `sku` | product code, sku, product code / sku, design no, code |
   | `name` | product name, name, design name |
   | `catalogName` | catalog name, catalog, catalogue |
   | `category` | category, type |
   | `fabric` | fabric, material |
   | `colours` | colours, colors, colour, variants, colours / variants |
   | `sizes` | sizes, size |
   | `piecesPerSet` | pieces per set, pcs per set, set pcs |
   | `price` | wholesale price, price, rate |
   | `mrp` | mrp |
   | `priceType` | price type |
   | `moq` | moq, min order qty |
   | `availableQty` | available qty, qty, stock, quantity |
   | `images` | image links, images, image, photos |
   | `videoUrl` | video link, video |
   | `description` | description, details |
   | `gstPct` | gst, gst % |
   | `active` | active, active (yes/no), show |
   | `tags` | tags, badges |

   If a required column (`sku`, `name`, `category`, `price`, `availableQty`, `images`, `active`) can't be found, the run fails with a "column X not found" error and products are left unchanged.
4. **Validate rows** (sheet row numbers are 1-based, with the header on row 1):
   - Rows that are completely blank are ignored silently.
   - These problems skip the row and log a `SyncRowError`: missing SKU, name, category or price; a price, qty, MOQ, GST or MRP that isn't a valid number; no image link that parses; a duplicate SKU (the first row wins and later ones are logged).
   - Active: `yes/y/true/1` → active, and anything else → inactive.
   - Lists (colours, sizes, tags, images) are split on commas and newlines and trimmed.
   - Once the plan's `maxProducts` valid rows have been reached, further rows are logged as `PLAN_LIMIT`.
5. **Upsert:** compute `rowHash` (a hash of the normalised row) and load the existing products for the client. New SKUs are created, SKUs whose hash changed are updated, and unchanged ones are skipped. All of this runs in batched transactions.
6. **Removed SKUs:** only when steps 2–5 completed without a Google error, products whose SKU is no longer in the sheet get `removedFromSheetAt = now()`. They are hidden from the link, not deleted, so old orders keep their references. If the SKU comes back, the field is cleared.
7. **Images:** for each created or updated product, parse the image cells into Drive file IDs (see §9). Diff them against `ProductImage`, then insert new ones as `PENDING` and enqueue `images` jobs.
8. **Finish:** set the run to `SUCCESS`, or `PARTIAL` when some rows were skipped, update `SheetConnection.lastSyncedAt` and `lastStatus`, and call the web app's revalidation endpoint for `catalog:{clientId}`.

**Implementation notes (Milestone 3)**
- `SheetConnection.spreadsheetId` / `sheetName` are nullable (migration `sheet_connection_pending`): after Google sign-in the account is connected before a sheet is chosen.
- When a client's tab is chosen, the header row is checked first, so a wrong tab is refused before any sync.
- Images are re-resolved for new and changed rows. A **manual** "Sync now" also re-lists Drive folders for every row, because photos can be added to a folder without the row changing. Automatic syncs don't, to save Drive quota.
- Every sync re-queues images still `PENDING`, so a worker outage heals itself.
- Retries: a failed sync isn't retried by BullMQ; the next scheduler tick (every minute, once the interval has passed) runs it again. Image jobs retry 3× with exponential backoff on transient Google errors.
- Timestamps are stored as UTC `timestamp` columns (Prisma default). Raw SQL must use `now() at time zone 'utc'`, not `now()`, or values shift by the server's time-zone offset.

**Development fixtures (no Google credentials needed).** With `GOOGLE_FAKE_DIR=./dev-fixtures/google` (ignored in production), spreadsheet IDs starting `DEMO_` and Drive IDs starting `demo-` are read from local files; all other IDs still go to real Google, so fixtures and real sheets work side by side. `pnpm --filter @cataloglink/core dev:fixtures` regenerates them. To try it, connect a client with option B and paste `https://docs.google.com/spreadsheets/d/DEMO_shree_krishna_textiles_sheet/edit`. It has 5 good products, 3 rows with deliberate mistakes, a Drive-folder product and an inactive product. `DEMO_sheet_without_access_xx` simulates a sheet that isn't shared.

**Local stock hold and the next sync:** checkout decrements `Product.availableQty` locally (§11). The next sync overwrites it with the sheet value, because the sheet is the source of truth and the client updates it after dispatch. The client is told this in the dashboard.

---

## 9. Image pipeline

**Link parsing** (`core/google/links.ts`):
- `https://drive.google.com/file/d/<id>/view…`, `open?id=<id>`, `uc?id=<id>`, `thumbnail?id=<id>` → a file ID
- `https://drive.google.com/drive/folders/<id>` → a folder; list its image files (`mimeType contains 'image/'`, ordered by name)
- any other `https://` image URL → stored as an external URL with no processing (allowed but not cached)

**`images` job** (per `ProductImage`):
1. Get the file metadata (`modifiedTime`, `mimeType`, `size`), and skip if `driveModifiedAt` hasn't changed and the status is `READY`.
2. Download with `files.get({ alt: "media" })` as a stream, rejecting files over 20 MB.
3. Use `sharp` to create `thumb` (400 px wide) and `full` (1200 px wide) as WebP (quality 75 and 82), plus a tiny blur placeholder stored as base64.
4. Save through the `Storage` interface (`packages/core/src/storage.ts`, added in Milestone 2 for logos). In the MVP that is `LocalStorage` writing to `MEDIA_DIR` (default `<repo>/media`, set by both apps) and served at `/media/<clientId>/<fileId>-<w>.webp` with long-lived cache headers. An `S3Storage` implementation can be added later without changing callers.
5. Set the status to `READY`, or `FAILED` with an error, which also shows in the client's sync errors as `BAD_IMAGE_LINK`.

Concurrency is limited (e.g. 4 per worker) so Drive quota and memory stay low.

---

## 10. Public catalog and caching

**Resolving `/c/[slug]`:** look up the `CatalogLink` by slug. If the link is inactive or the client is unavailable, render the "Catalog not available" page (HTTP 410/404 with `noindex`).

**Pages**
| Route | What it renders |
|---|---|
| `/c/[slug]` | Header (logo, banner, business name, WhatsApp and call buttons), filter bar, product grid |
| `/c/[slug]/catalog/[name]` | All designs in one catalog (e.g. "Rangoli Vol-3") |
| `/c/[slug]/p/[sku]` | Product detail: gallery with zoom, video, specs, variant and quantity picker, share |
| `/c/[slug]/cart` | Cart |
| `/c/[slug]/checkout` | OTP + details + payment mode |
| `/c/[slug]/orders` | "My orders" (OTP) and order detail |

**Data and caching**
- Server components load data through `core` query functions wrapped in Next.js caching and tagged `catalog:{clientId}` and `link:{linkId}`, with 300 s time-based revalidation as a fallback.
- When a sync finishes, a link is edited or an order is placed, the cache is invalidated: the worker calls `POST /api/internal/revalidate` (header `x-internal-secret: INTERNAL_API_SECRET`), and server actions invalidate the tags directly. The Next.js 16 `revalidateTag` call signature is confirmed during Milestone 5.
- **Filters** live in URL search params (`?category=Saree&fabric=Georgette&min=500&max=1500&colour=Red&new=1`), so a filtered view can be shared. Facets (distinct categories, catalogs, fabrics and colours, plus the price range) come from one cached query per link.
- **Pagination:** the first 24 products are server-rendered, then infinite scroll fetches `GET /api/v1/public/c/[slug]/products?cursor=…` with the same filters.
- **Price visibility:** when `showPrice=false`, prices are left out of the server response itself, not just hidden in the UI.
- **Badges:** "New" when the product has a `New Arrival` tag or `firstSeenAt` is within `newArrivalDays` (default 7). "Out of stock" when `availableQty = 0`. "Only N left" at or below the client's low-stock threshold (Settings; 0 = off).
- **WhatsApp previews:** `generateMetadata` sets `og:title` (business name / product name), `og:description` and `og:image` (the logo or the first product thumbnail).
- **Performance budget:** catalog JS under about 100 KB gzipped, lazy images with blur placeholders, no dashboard code imported. Target: LCP under 3 s on simulated 4G with 500 products.
- **Built in Milestone 5:**
  - Data is cached with `unstable_cache` (still supported in Next.js 16). Moving to `"use cache"` would mean turning on Cache Components for the whole app.
  - `revalidateTag(tag, { expire: 0 })` is the Next.js 16 signature used for invalidation.
  - Images are plain `<img>` elements rather than `next/image`, because the worker already makes 400/1200 px WebP files and a second optimisation pass would only add work.
  - The whole link is cached as one snapshot (up to the plan's product limit), so filtering, sorting and paging happen in memory.

---

## 11. Cart and checkout

**Cart (client side)**
- Stored in `localStorage` under `cl_cart_<linkId>`. Each line is `{ productId, sku, colour?, size?, qty }`.
- The quantity stepper has a minimum of MOQ, a maximum of `availableQty`, and steps of 1. When the price is per set, quantity is counted in sets.
- When the cart opens it calls `POST /api/v1/public/c/[slug]/cart/validate` for current prices and stock, and shows any changes (price changed, qty reduced, out of stock, removed).
- Totals: `lineTotal = unitPrice × qty`; GST per line is `lineTotal × gstPct / 100`; `grandTotal = subtotal + gstTotal`. All money maths is done on the server with `Decimal`, and the client only displays it.

**Checkout**
1. The customer enters their mobile number and receives an OTP (`POST …/otp/send`, `…/otp/verify`), which sets the customer cookie. A returning customer's details are pre-filled.
2. Form: name, shop name, city, delivery address, GST (optional), transport/courier preference, notes, and a payment mode chosen from the client's `paymentModes`. The UPI QR and bank details are shown for the modes that need them.
3. `POST /api/v1/public/c/[slug]/checkout` runs **one database transaction**:
   1. Reject the order if the link has `allowOrdering=false`, the client is unavailable, or the customer is blocked.
   2. Count the client's orders this month, and reject if the count is at or above the plan's `maxOrdersPerMonth` (the customer sees a generic "ordering unavailable" message).
   3. `SELECT … FROM "Product" WHERE id IN (…) AND "clientId" = $1 FOR UPDATE`, which locks the rows.
   4. For each line, check the product is visible, `qty ≥ moq` and `qty ≤ availableQty`. On any failure, roll back and return the lines that conflict.
   5. Decrement `availableQty` by the ordered qty (the local hold).
   6. Upsert the `Customer` by `(clientId, mobile)`, and increment `ClientCounter` to get the `orderNo`.
   7. Insert the `Order`, the `OrderItem` snapshots and an `OrderStatusHistory` row with status `PLACED`.
4. After commit:
   - enqueue `orders-sheet:append` if `writeOrdersTab` is on
   - invalidate the catalog cache
   - clear the cart
   - redirect to the confirmation page
5. The confirmation page shows the order summary. The client sees the new order on the dashboard (new-order badge). Email alerts and the "Send order on WhatsApp" button are on hold (§13).

**Two buyers and the last set:** two parallel checkouts for the final set wait on the same row lock. The second sees `availableQty = 0` and gets a conflict. This case has a test of its own.

---

## 12. Order management

**Status machine** (`core/orders/status.ts`)

```
PLACED ──► CONFIRMED ──► PACKED ──► DISPATCHED ──► DELIVERED
  │            │            │
  ├──► REJECTED (client, reason required)
  └──► CANCELLED (customer while PLACED, or client before DISPATCHED; reason required)
```

| Status | Set by | Customer sees |
|---|---|---|
| `PLACED` | system | Order received |
| `CONFIRMED` | client | Order confirmed |
| `PACKED` | client | Being packed |
| `DISPATCHED` | client | Shipped |
| `DELIVERED` | client | Delivered |
| `REJECTED` / `CANCELLED` | client / customer | Cancelled, with the reason |

`PARTIALLY_CONFIRMED` and LR/AWB fields are Phase 2. The enum value is reserved now so no migration is needed later.

- Any transition not in the table is rejected by `assertTransition(from, to)`, which is unit-tested.
- Rejecting or cancelling an order **adds the held quantity back** to `availableQty` locally, because the next sync takes the sheet value anyway.
- `paymentReceived` is a separate toggle and can be set in any status other than rejected or cancelled.
- The customer sees status changes on "My orders". A "Notify customer on WhatsApp" button is on hold (§13).

**Client UI:** status tabs with counts, search by order number, customer name or mobile, and a date filter. The detail drawer shows the customer, items with variants, totals, notes, payment and history. A new-order badge polls every 30 s.

**Documents**
- `GET /api/v1/client/orders/[id]/pdf` streams an order PDF or packing slip made with `pdfkit` (business header, customer, items, totals, payment details).
- `GET /api/v1/client/orders/export.xlsx?status=…&from=…&to=…` produces one row per item with `exceljs`.

**Orders tab in the sheet** (when `writeOrdersTab` is on): the `orders-sheet` worker creates an `Orders` tab with headers if it doesn't exist, appends one row per order item (`Order No, Date, Customer, Mobile, City, SKU, Product, Colour, Size, Qty, Unit Price, Line Total, Order Total, Payment Mode, Status`), and rewrites the status cells when the status changes (it finds the rows by `Order No`). Jobs retry up to 5 times with backoff. Errors show on the client dashboard but never block the order.

---

## 13. Notifications

> **On hold (decided 2026-10-29).** No notifications are built in the current milestones: no email, no wa.me buttons and no templates. They will be implemented separately later. The design below is kept as the reference for that work. Until then, users see the same information in the app: new orders on the dashboard, sync status and errors on the sync page, order status on "My orders". Super Admin shares client login details manually. OTP SMS (MSG91) is part of login, not a notification, so it is still built.

When this is picked up, in the MVP there is **no automatic WhatsApp sending**. WhatsApp messages are `wa.me` deep links that a person taps; the WhatsApp Business API is Phase 2.

| Event | To client | To customer | MVP channel |
|---|---|---|---|
| New order placed | yes | confirmation page | Email + dashboard badge; customer gets a wa.me button to send the order to the client |
| Order confirmed / dispatched / delivered | — | yes | wa.me button for the client on the order page |
| Order rejected / cancelled | yes (if cancelled by the customer) | yes | Email to the client; wa.me button to the customer |
| Sheet sync failed | yes | — | Dashboard + email (at most once per 6 h per client) |
| Plan expiring (7/3/1 days) | yes | — | Email + a wa.me link on the Super Admin dashboard |
| Client created / credentials | yes | — | Email + a wa.me link for the admin |

Templates live in `NotificationTemplate` (editable by the Super Admin), and are seeded with English defaults. Rendering is simple `{{placeholder}}` replacement, and wa.me text is URL-encoded and kept under about 1,500 characters.

---

## 14. Background jobs and cron

| Queue / job | Trigger | Concurrency / retry |
|---|---|---|
| `sync` (per client) | `sync:tick` every minute; Sync now | jobId dedupe, global limiter, 3 attempts, exponential backoff |
| `images` | after a sync | 4 per worker, 3 attempts |
| `orders-sheet` | order placed or status changed | 2 per worker, 5 attempts |
| `maintenance:heartbeat` | every minute | writes `worker:heartbeat` to Redis (read by `/api/health`) — **Milestone 1** |
| `cron:plan-expiry` | daily 09:00 IST | marks expired subscriptions; the 7/3/1-day reminders are on hold (§13) |
| `cron:cleanup` | daily 03:00 IST | deletes used/expired OTPs and sync runs older than 30 days (keeping the latest 20 per client) |

The sync-failure email digest is on hold (§13).

Repeatable jobs are registered when the worker starts (`upsertJobScheduler`, so they are idempotent). The worker logs as JSON (pino) and shuts down gracefully on SIGTERM.

---

## 15. Routes and API

**Pages**
| Path | Who |
|---|---|
| `/login` | Super Admin, Client |
| `/admin`, `/admin/clients`, `/admin/clients/[id]`, `/admin/plans`, `/admin/settings` | Super Admin |
| `/app` (dashboard), `/app/onboarding`, `/app/sheet`, `/app/products`, `/app/links`, `/app/customers`, `/app/orders`, `/app/profile`, `/app/settings` | Client |
| `/c/[slug]/…` | Public / customer (see §10) |

**Route handlers** (`/api/v1`; everything else is a Server Action)
| Method + path | Auth | Purpose |
|---|---|---|
| `GET /api/health` | public | Database, Redis and worker heartbeat status |
| `POST /auth/otp/send`, `POST /auth/otp/verify` | public | Client mobile-OTP login |
| `GET /google/oauth/callback` | client | OAuth code exchange |
| `GET /client/links/[id]/qr?format=png\|svg[&download=1]` | client | QR code for a link (PNG 1024 px or SVG) |
| `GET /client/orders/[id]/pdf?type=order\|packing` | client | Order PDF / packing slip |
| `GET /client/orders/export?status=&q=&from=&to=` | client | Excel export |
| `GET /client/orders/new-count` | client | New-order badge polling |
| `GET /client/sync/status` | client | Sync/image progress, polled by the Google Sheet page |
| `GET /sheet-template` | Super Admin or client | Template download |
| `GET /media/[...path]` (no `/api/v1` prefix) | public | Stored images (logos, thumbnails); non-image files are never served |
| `GET /public/c/[slug]/products` | public | Paginated, filtered products |
| `GET /public/c/[slug]/facets` | public | Filter options |
| `POST /public/c/[slug]/cart/validate` | public | Prices and stock for the cart |
| `POST /public/c/[slug]/otp/send`, `/otp/verify` | public | Customer OTP |
| `POST /public/c/[slug]/checkout` | customer | Place order |
| `GET /c/[slug]/orders`, `/c/[slug]/orders/[orderNo]` (pages) | customer | My orders / order detail |
| `POST /public/c/[slug]/orders/[orderNo]/cancel` | customer | Cancel while `PLACED` |
| `POST /public/c/[slug]/logout` | customer | End the customer session |
| `POST /api/internal/revalidate` | internal secret | Cache invalidation from the worker |

All inputs are validated with the zod schemas from `packages/validation`. Errors use one JSON shape: `{ error: { code, message, details? } }`.

**Server actions (main ones):**
- Auth: `passwordLogin`, `logout`
- Super Admin: `createClient`, `updateClient`, `setClientStatus`, `deleteClient`, `assignPlan`, `recordPayment`, `impersonateClient`, `exitImpersonation`, plan CRUD
- Client: `startGoogleOAuth`, `connectSheet`, `syncNow`, `toggleProductHidden`, link CRUD, `updateProfile`, `updateSettings`, customer CRUD, `blockCustomer`, `changeOrderStatus`, `markPaymentReceived`

---

## 16. Testing strategy

| Level | Tool | What is covered |
|---|---|---|
| Unit (`pnpm test`) | Vitest | env validation, sessions, passwords, OTP service, MSG91 request, rate limit (Redis DB 15), tenant arg scoping, mobile/email parsing (Milestone 1); later header alias mapping, row validation, Drive link parsing, slug generation, money/GST maths, the order status machine, plan-limit checks, crypto round-trip |
| Integration (`pnpm test:db`) | Vitest + a test Postgres (`<db>_test`). Setup only runs `prisma migrate deploy` (non-destructive) and refuses any database whose name doesn't end in `_test`. Tests use run-unique slugs/mobiles and delete only the rows they created. | tenant isolation (client A can't read B), sync upsert/removal, "Google error keeps products", **parallel last-set checkout (exactly one succeeds)**, order monthly limit, cancel restores the hold |
| Google | mocked `SheetSource` for automated tests; one manual run against a real test sheet and Drive folder | read, images, Orders-tab append |
| End-to-end | Playwright, mobile viewport | admin creates a client → sync (mocked Google) → customer browses, filters, checks out with OTP → client processes the order, PDF/Excel → qty 0 shows out of stock → deactivated client shows "not available" |
| Performance | Lighthouse (mobile, 4G) | `/c/[slug]` with 500 products, LCP under 3 s |

Each milestone ends with its own tests passing (`pnpm test`, `pnpm typecheck`, `pnpm lint`).

---

## 17. Deployment notes

The deployment target is not decided yet. The code keeps every option open:

- **Self-hosted VPS (simplest):** Docker images for `web` (Next.js `output: "standalone"`) and `worker`, plus Postgres, Redis and Nginx/Caddy for HTTPS. `MEDIA_DIR` sits on a persistent volume, and a CDN (e.g. Cloudflare) goes in front.
- **Vercel for `web`:** possible, but the worker must run elsewhere (Railway, Render, Fly or a VPS), Postgres needs a connection pooler, and media must move to S3/R2 (the `Storage` interface makes this a config change).
- **Backups (§14):** a daily `pg_dump` to off-site storage with 14-day retention. The script ships in Milestone 8.
- **Migrations:** `pnpm db:deploy` runs before the new `web` and `worker` versions start.

---

## 18. Milestones and checklist

**Working agreement:** steps go in order. After each one the work stops for review, with a report on what was built, how to check it, the test results and any deviations. The next milestone starts only after confirmation. Boxes are ticked as items are finished.

### Step 0 — Documentation
- [x] `README.md` (setup guide)
- [x] `docs/IMPLEMENTATION.md` (this document)
- [x] `.env.example` (required variables only)

### Milestone 1 — Foundation
- [x] pnpm workspace (Turborepo dropped, see §3), TypeScript base config, ESLint (web), Prettier, `.gitignore`
- [x] `docker-compose.yml`: postgres, redis
- [x] `packages/db`: Prisma 7 schema for all MVP tables (§5), `prisma.config.ts`, driver adapter
- [x] First migration (`20261029000000_init`) + seed (Super Admin, default "Starter" plan, platform settings), applied to the local database
- [x] Prisma client singleton + `db.forClient(clientId)` tenant extension
- [x] `packages/core/env.ts`: zod-validated environment
- [x] `apps/web`: Next.js 16 + Tailwind 4 scaffold; route trees `/login`, `/admin`, `/app`, `/c/[slug]`; `/api/health`
- [x] Session library (`jose`) + `requireSuperAdmin()`, `requireClient()`, `requireCustomer()`
- [x] `proxy.ts` role redirects
- [x] Email + password login (argon2id), logout
- [x] OTP provider interface + console stub + MSG91 implementation; client mobile-OTP login; Redis rate limits
- [x] `apps/worker`: BullMQ connection, queue definitions in `core/queues`, heartbeat job, graceful shutdown
- [x] Vitest setup (`pnpm test`, 35 tests) + database tests (`pnpm test:db`, 6 tests: tenant isolation, OTP table)
- [x] Live smoke test: health check, worker heartbeat, Super Admin password login, client OTP login, rate limit, role redirects, catalog link pages

### Milestone 2 — Super Admin panel
- [x] Admin layout + navigation (mobile-friendly, horizontally scrolling tabs)
- [x] Clients list (search by name/owner/mobile/email/city/slug; filters All / Active / Inactive / Plan expired; pagination)
- [x] Add/edit client form, including logo upload (PNG/JPG/WebP checked by file signature, ≤ 2 MB, stored via `Storage` → `/media/...`)
- [x] Slug generator with a collision suffix; default `CatalogLink` (same slug), owner login, order counter and first subscription created in one transaction. The slug never changes on edit.
- [x] Activate / deactivate / delete client (delete requires typing the business name; orders are removed first because Order → Customer is RESTRICT)
- [x] Plans CRUD (plans that were ever assigned can't be deleted, only deactivated)
- [x] Assign plan: start/expiry, trial days (assigning cancels the previous trial/active subscription); manual payment records
- [ ] ~~Send credentials: email + wa.me link~~ (on hold, notifications). Instead the admin sets or generates the initial password, and can reset it on the client page.
- [x] Impersonate client + exit banner (`/admin` is blocked while impersonating; each start is logged as `[audit]`)
- [x] Dashboard: total/active clients, links, orders today / this month (IST), **plans expiring within 7 days** (stands in for the reminders while notifications are on hold), failed syncs
- [x] Client detail: business, owner login, plan, payments, usage counts, sheet connection, last 5 sync runs with row errors
- [x] Settings: default sync interval, "New" badge days, sheet template upload/download (`/api/v1/sheet-template`, login required). Notification templates on hold.
- [x] Tests: 18 validation + 36 core unit tests, 8 client-lifecycle DB tests, and a 21-step browser run (headless Chrome, 390 px phone viewport) covering every item above

### Milestone 3 — Google Sheet + Drive sync
- [x] Template with all §7 columns, built by `buildTemplate()` (exceljs): coloured required headers, cell notes, Yes/No and Per piece/Per set dropdowns, a "How to use" tab. Served at `/api/v1/sheet-template` (an admin-uploaded template wins); a copy is in `sheet-template/` (`pnpm --filter @cataloglink/core build:template`).
- [x] AES-256-GCM crypto for OAuth refresh tokens (`core/src/crypto.ts`)
- [x] Google OAuth start (server action) + callback (`/api/v1/google/oauth/callback`), with a signed, nonce-bound, 10-minute `state`. Scopes `openid email spreadsheets drive.readonly`; consent without a refresh token or without Sheets/Drive is rejected with a clear message. **Built and unit-tested; not yet tried against real Google** (waiting for the OAuth client ID/secret).
- [x] Spreadsheet picker (OAuth: list from Drive) + tab picker (`/app/sheet/select`)
- [x] Service-account connect: paste link → open → pick tab → header check
- [x] `GoogleSource` interface (`core/src/google/source.ts`) with `ApiGoogleSource` (`@googleapis/sheets` + `@googleapis/drive`; the 246 MB `googleapis` package isn't used) and a development fixture source
- [x] Header alias normaliser (`core/src/sync/headers.ts`)
- [x] Row validator with row-numbered errors, case-insensitive duplicate SKUs, plan cap, warnings for partly-bad image links (`core/src/sync/validate.ts`)
- [x] Upsert by `(clientId, sku)` with `rowHash`; soft-remove only after a fully successful read. A row that turns invalid keeps its last good data; rows over the plan limit are hidden.
- [x] Failure handling: failed `SyncRun` with a readable reason, products untouched, error shown on the sheet page and the Super Admin client page (email alert on hold)
- [x] Drive link and folder parser (file, open?id, uc?id, thumbnail, lh3, folders, `/u/N/` variants; plain https image URLs are shown as-is)
- [x] Image worker (`sharp` WebP 400/1200 + blur placeholder; file names carry a version hash of Drive `modifiedTime` so caches never show an old photo; unchanged files are skipped)
- [x] Sync worker (BullMQ deduplication per client, concurrency 3, limiter 5/s) + `sync-tick` scheduler every minute + recovery of syncs stuck in RUNNING > 15 min
- [x] Worker → web revalidation endpoint (`/api/internal/revalidate`, shared secret, `revalidateTag(tag, { expire: 0 })`)
- [x] Client onboarding checklist (dashboard) and Google Sheet page: connect options, Sync now with live status, last-run stats, row error table, image problems, history, change tab, disconnect
- [x] Tests: 24 parsing/crypto unit tests, 15 Google/OAuth/scheduler unit tests, 10 sync DB tests (incl. "Google error keeps products", thumbnails, folder refresh, plan cap), and a 16-step browser run (phone size) against the development fixtures

### Milestone 4 — Client products & catalog links
- [x] Products page (`/app/products`):
  - search by name/SKU/fabric
  - filters for category, catalog, stock (in / low / out) and visibility, applied on change
  - photo cards with stock badges
- [x] Product page (`/app/products/[id]`): customer-style preview (swipe photos, price/MRP, MOQ, colours, sizes), the sheet data, photo problems, and which links show it
- [x] Hide/show override (`hiddenByClient`) from the list and the product page; the sheet's Active column still applies
- [x] Links list (`/app/links`):
  - product count per link, using the same visibility rule as the catalog (`VISIBLE_PRODUCT` + `linkProductWhere` in `core/src/links.ts`)
  - create/edit by category, catalog or hand-picked products, with a live "N shown" count
  - show price, allow ordering, link on/off, delete
- [x] Link rules:
  - addresses share one namespace with client slugs and are fixed after creation
  - an empty address is generated as `<client-slug>-<link-name>`
  - category and catalog names match case-insensitively
  - product picks are filtered to the client's own products
  - the default link always shows ALL and stays on
- [x] Plan `maxCustomLinks` enforced in a transaction that locks the client row (the default link doesn't count)
- [x] Copy link, WhatsApp share (`wa.me/?text=`), QR preview + PNG/SVG download (`qrcode`)
- [x] Profile (`/app/profile`):
  - business name, customer WhatsApp number (new `Client.whatsappNumber`, migration `client_profile`), city, address, GST
  - logo, banner, UPI ID / UPI QR, bank details, payment modes
  - UPI needs an ID or QR, and bank transfer needs holder/number/IFSC
- [x] Settings (`/app/settings`): out-of-stock mode (badge/hide), low-stock badge threshold, "New" days, sync interval (5 min – 1 day, or the platform default), Orders tab on/off (stored now, used in Milestone 7)
- [x] Dashboard: counts use the visibility rule, plus a profile step and a link to sharing options
- [x] `pnpm demo:data`: dummy products, photos and links through the real sync + image code
- [x] Tests:
  - unit: link/profile/settings schemas, `isNewArrival`, `parseClientSettings`
  - DB (`links.db.test.ts`): counts, slugs, limit, tenant isolation, default link, profile and settings
  - Playwright at 390 px: 17 steps

### Milestone 5 — Public catalog link
- [x] Link resolver (`resolveCatalogLink` in `core/src/catalog.ts`):
  - resolved on every request (not cached), so turning off a link, deactivating a client or an expiring plan takes effect at once
  - otherwise the request 404s, showing the "Catalog not available" page with `noindex`
- [x] Branded header: banner, logo, business name, city, link name; WhatsApp (`wa.me/91…`, customer WhatsApp number or login mobile) and call buttons; footer with address and GSTIN
- [x] Cached catalog data:
  - one lean snapshot per link (`loadCatalogSnapshot`) wrapped in `unstable_cache`
  - tags `catalog:{clientId}` + `link:{linkId}`, 300 s fallback
  - product detail cached the same way (`loadCatalogProduct`)
  - prices and MRP are set to `null` in the data itself on price-hidden links
- [x] Badges: New (a "New Arrival" tag or within the "New" days), Out of stock, Only N left (the client's threshold); hide-out-of-stock mode respected
- [x] URL filters: `q`, `category`, `catalog`, `fabric`, `colour`, `min`, `max`, `new=1`, `stock=1`, `sort` (featured / newest / price ↑↓)
  - selects apply on change
  - removable filter chips
  - facets come from the link's full product set
- [x] Infinite scroll: the first 24 are server-rendered, the rest come from `GET /api/v1/public/c/[slug]/products?cursor=…`, with a "Show more" fallback
- [x] Facets API: `GET /api/v1/public/c/[slug]/facets`
- [x] Catalogs strip + catalog view `/c/[slug]/catalog/[name]`
- [x] Product page `/c/[slug]/p/[sku]`:
  - swipe gallery with thumbnails
  - full-screen viewer with tap-to-zoom (phones can also pinch)
  - YouTube / Drive video embedded on demand
  - specs, description, more from the same catalog
- [x] Variant select + qty stepper:
  - colour chips, plus "Full set" for set-priced products with several colours
  - a size choice for per-piece products
  - quantity from MOQ up to stock, with the total and GST
  - below MOQ or out of stock: "Ask on WhatsApp"
- [x] Until the cart arrives (Milestone 6), "Order on WhatsApp" sends the seller the product, colour/size, quantity, price and link
- [x] Share product: the phone's share sheet, or WhatsApp
- [x] OG metadata for WhatsApp previews (catalog, catalog view, product)
- [x] Image performance:
  - pre-sized WebP `<img>` with `loading="lazy"` and blur placeholders, first row eager
  - catalog pages import no dashboard code
- [x] Tests:
  - unit (`catalog.test.ts`): filters, sort, facets, paging, contact links
  - DB (`catalog.db.test.ts`): availability, visibility, hide-out-of-stock, price hiding, link selection
  - Playwright at 390 px: 14 steps

### Milestone 6 — Cart & checkout
- [x] Cart:
  - `localStorage` per link (`cl_cart_<linkId>`)
  - "Add to cart" on the product page with colour / size / full set and quantity; the same product and variant add up
  - header cart button with a count, kept in sync across tabs
- [x] Cart validation `POST /api/v1/public/c/[slug]/cart/validate`:
  - `priceCart` in `core/src/orders/cart.ts` (pure, `Decimal`) checks variants, MOQ, stock shared across lines, price changes and products gone from the link
  - quantity / price changes are written back to the cart and explained
  - out of stock, removed or invalid variant blocks checkout until removed
  - GST per line, subtotal / GST / grand total
- [x] Customer OTP + session:
  - `…/otp/send` (rate-limited per mobile and IP) and `…/otp/verify`, which sets `cl_cust_<clientId>`
  - one login works across all of the seller's links
  - returning customers' details are pre-filled
  - "Not you? Log out"
- [x] Checkout form:
  - name, shop, city, delivery address, GST, transport, notes
  - payment mode from the seller's `paymentModes`, showing the UPI ID / QR or bank details
- [x] Transactional checkout `placeOrder` (`core/src/orders/checkout.ts`):
  - checks ordering on, payment mode allowed, customer not blocked
  - locks `ClientCounter` (serialises the seller's checkouts: exact order numbers and monthly limit), then the plan's monthly order limit
  - `SELECT … FOR UPDATE` on the products, then re-checks stock, MOQ, price and visibility; any conflict returns 409 with the changed lines
  - holds the stock, upserts the customer, writes order, item snapshots and history
  - retries on deadlock
- [x] Price-hidden links: no prices in the cart, checkout or the customer's order view; the order still stores prices for the seller
- [x] After commit:
  - catalog cache invalidated
  - Orders-tab job queued when `writeOrdersTab` is on and a sheet is connected (`enqueueOrderSheetWrite`; the worker that writes the tab is Milestone 7)
  - email on hold
- [x] Confirmation / order page `/c/[slug]/orders/[orderNo]`:
  - progress timeline, items, totals, delivery details
  - how to pay (UPI / bank)
  - the wa.me "send order" button is on hold with notifications
- [x] My orders `/c/[slug]/orders` (OTP), plus cancel while `PLACED` (stock returned, history kept)
- [x] Cookie-authenticated POSTs only accept JSON with a same-origin `Origin` (`crossSiteBlocked` in `lib/api.ts`)
- [x] Client dashboard shows a "New orders" count until the orders screen arrives in Milestone 7
- [x] Tests:
  - DB (`orders/checkout.db.test.ts`):
    - cart checks, totals and stock hold
    - order numbers, rollback on conflict
    - **two buyers, last set: exactly one succeeds**
    - blocked customer, ordering off, payment mode, monthly limit
    - cancel, price-hidden link
  - Playwright at 390 px: 16 steps

### Milestone 7 — Order management
- [x] Orders list `/app/orders`:
  - tabs New · Confirmed · Packed · Dispatched · Delivered · Cancelled · All, with counts
  - search by order no., customer, shop, city or mobile, plus an IST date range
  - opens on "New" when something is waiting
  - table on desktop, cards on phones
- [x] New-order alert:
  - "Orders" badge in the navigation and a "New orders" card on the dashboard
  - `NewOrderWatcher` polls `GET /api/v1/client/orders/new-count` every 30 s; when the count changes it refreshes the page and shows the count in the tab title
- [x] Order detail `/app/orders/[id]` (a page rather than a drawer, for phones):
  - items with variants, GST and totals; the customer's notes and transport preference
  - customer and delivery address, payment, history, Orders-tab status
- [x] Status actions:
  - Confirm → Mark packed → Mark dispatched (optional transport / LR note, kept in history) → Mark delivered
  - Reject (while new) or cancel (before dispatch) with a reason the customer sees; held stock is returned (`changeOrderStatus` in `core/src/orders/manage.ts`, row-locked)
- [x] Mark payment received / not received
- [x] Status machine `core/src/orders/status.ts` (`assertTransition`, `nextStatuses`, tabs) + unit tests
- [ ] ~~wa.me notify-customer button~~ (on hold with notifications). The customer sees each status on "My orders".
- [x] Order PDF and packing slip:
  - `GET /api/v1/client/orders/[id]/pdf?type=order|packing`, made with `pdfkit` and the bundled DejaVu Sans fonts (for ₹) in `packages/core/assets/fonts`
  - the slip has no prices, with a tick box per line
- [x] Excel export `GET /api/v1/client/orders/export?status=&q=&from=&to=`: one row per item, same filters as the list (`exceljs`)
- [x] Orders tab (`core/src/orders/sheet-writer.ts`, worker queue `orders-sheet`):
  - creates "Orders" with headers if missing, appends one row per item, then only rewrites the Payment Received / Status cells
  - values are written `RAW`, so they're never treated as formulas
  - errors are stored on `Order.sheetError` (migration `order_sheet_error`) and retried 5× with backoff; orders are never blocked
  - `GoogleSource` gained `ensureTab`, `appendRows` and `updateCells`; the dev fixture source writes to the git-ignored `dev-fixtures/google/.writes/`
- [x] Customers `/app/customers`:
  - list with order count, total ordered (excluding cancelled orders) and last order; search; blocked filter
  - add by hand and assign catalog links
  - customer page with order history, edit and block / unblock
  - the mobile can't change once a customer has orders, because "My orders" finds orders by mobile
- [x] Tests:
  - unit `status.test.ts`
  - DB `manage.db.test.ts`: transitions, history, stock return, tenant check, payment, tabs, search, Orders-tab append/update/error, PDF/XLSX, customers
  - Playwright: 14 steps, customer order → seller badge → full status flow → reject → files → Orders tab → customers

### Milestone 8 — Hardening & release prep
- [ ] Cron: mark expired plans, cleanup (reminder and digest emails on hold)
- [ ] Rate limits on login, OTP and public API
- [ ] Error pages, empty states, loading skeletons
- [ ] Security pass: tenant isolation tests, cookie flags, CSRF/origin checks on route handlers, no secrets in logs
- [ ] Playwright E2E full loop
- [ ] Manual Google integration test (service account + OAuth test user, Orders tab)
- [ ] WhatsApp link preview check
- [ ] Lighthouse mobile pass on the catalog
- [ ] Production Dockerfiles + `pg_dump` backup script
- [ ] README updated with production deployment steps
