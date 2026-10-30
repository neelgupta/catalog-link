# CatalogLink – Progress and Versions

Status as of **29 October 2026**. Milestones 1–7 of the MVP (Phase 1) are done; Milestone 8 is next.
For setup see [README.md](../README.md); for how things work see [IMPLEMENTATION.md](IMPLEMENTATION.md).

## Milestone status

| # | Milestone | Status |
|---|---|---|
| 1 | Foundation (monorepo, database, login, OTP, worker) | Done |
| 2 | Super Admin panel | Done |
| 3 | Google Sheet + Drive sync | Done. Tested with demo data. Real Google credentials are now installed and checked; the first real sign-in is pending a Google-side error |
| 4 | Client products & catalog links | Done |
| 5 | Public catalog link (`/c/[slug]`) | Done |
| 6 | Cart & checkout | Done |
| 7 | Order management | Done |
| 8 | Hardening & release prep | Next |

**On hold by request:** notifications (email alerts, WhatsApp message templates, SMTP, the "send login details" button). OTP SMS for login is built.
**Removed by request:** OneDrive images. Photos come from Google Drive only.

---

## Features done

### Milestone 1 – Foundation
- pnpm monorepo:
  - `apps/web` (Next.js)
  - `apps/worker` (BullMQ background jobs)
  - `packages/db` (Prisma)
  - `packages/core` (business logic)
  - `packages/validation` (zod)
- PostgreSQL schema for all MVP tables, first migration, seed (Super Admin + "Starter" plan + platform settings).
- Every client's data is kept separate: every client table has a `clientId`, and the Prisma tenant extension `forClient(clientId)` filters every query by it.
- **Logins:**
  - Super Admin and client: email + password (argon2id); sessions are signed cookies (JWT, `jose`).
  - Client: mobile OTP. Codes are hashed, expire in 5 minutes and allow 5 attempts. Redis rate limits apply.
  - OTP providers: MSG91 (production) or console (development).
- Route guards for `/admin` and `/app` (Next.js 16 `proxy.ts`, plus a check in every page and action).
- Worker with BullMQ queues and a heartbeat; `/api/health` checks the database, Redis and the worker.

### Milestone 2 – Super Admin panel
- Dashboard: total/active clients, links, orders today / this month (IST).
- **Clients:**
  - list with search and status filter (active / inactive / plan expired)
  - add/edit: business, owner, mobile, email, GST, city, address, logo
  - creating a client also sets up its unique catalog link, owner login, order counter and subscription in one transaction
  - activate / deactivate / delete
  - reset password
- Plans: create/edit/delete with limits (products, custom links, staff, orders per month, price, duration).
- Subscriptions: assign a plan with start/expiry and trial days; manual payment records.
- "Login as client" (impersonation) with an exit banner.
- Client detail page: subscription, payments, last sync and sync errors.
- Platform settings: default sync interval, "New" badge days, upload the sheet template.

### Milestone 3 – Google Sheet + Drive sync
- **Sheet template:** a downloadable `.xlsx` with all the requirement-document columns, notes, dropdowns and a "How to use" tab.
- **Two ways to connect a sheet:**
  - **Sign in with Google (OAuth):** pick a spreadsheet, then a tab.
  - **Share with CatalogLink (service account):** paste the sheet link.
  - Both check the column headers before saving.
- OAuth refresh tokens are encrypted (AES-256-GCM).
- **Sync:**
  - accepts many variations of column names
  - row checks: required fields, duplicate SKUs, bad photo links, plan product limit
  - an error report with row numbers
  - only changed rows are updated; rows deleted from the sheet are hidden, not deleted
  - **a Google error never deletes or changes products**
- **Photos:**
  - single Drive file links or whole Drive folders
  - the worker makes 400 px and 1200 px WebP thumbnails plus a blur placeholder, and skips photos that haven't changed
- **Scheduling:**
  - automatic sync every few minutes (per client or platform default) plus "Sync now"
  - one sync per client at a time
  - a sync stuck for 15 minutes is marked failed and retried
- Catalog cache refreshed after each sync.
- **Client UI:** a setup checklist, and a Google Sheet page with live sync status, results, error table, sync history, change tab and disconnect.
- **Development demo data (`GOOGLE_FAKE_DIR`):** sheet IDs starting `DEMO_` and Drive IDs starting `demo-` are read from `dev-fixtures/google`. This is never active in production.

### Milestone 4 – Client products & catalog links
- **Products page:**
  - search (name, SKU, fabric)
  - filters: category, catalog, stock (in / low / out), visibility
  - photo cards with stock badges
- **Product page:** a preview of how customers see it (photos, price/MRP, MOQ, colours, sizes), plus the sheet data, photo problems and which links show it.
- **Hide / show** a product on links without touching the sheet.
- **Catalog links:**
  - default link + custom links by category, catalog or hand-picked products, with a live product count
  - per-link options: show price, allow ordering, on/off; delete custom links
  - the plan's custom-link limit is enforced
  - link addresses are unique and can't change after creation
  - **sharing:** copy link, share on WhatsApp, QR code (preview, PNG and SVG download)
- **Business profile:**
  - business name, WhatsApp number for customers, city, address, GST
  - logo, banner
  - payment options: pay later, UPI (ID/QR), bank transfer (bank details)
- **Settings:**
  - out-of-stock products: badge or hide
  - "Only N left" threshold
  - "New" badge days
  - automatic sync interval
  - Orders-tab on/off (saved now, used in Milestone 7)
- **Dummy data:** `pnpm demo:data` creates "Shree Krishna Textiles (Demo)" with 34 products, 48 photos and 3 custom links. `pnpm demo:data --client <slug>` loads them into an existing client.

### Milestone 5 – Public catalog link
- **Catalog home `/c/<link>`:**
  - seller branding (banner, logo, name, city) with WhatsApp and call buttons
  - catalogs strip
  - search, filters (category, catalog, fabric, colour, price range, new arrivals, in stock) and sorting; filters live in the URL, so a filtered view can be shared
  - product grid with New / Out of stock / Only N left badges, and infinite scroll
- **Catalog view `/c/<link>/catalog/<name>`:** every design in one catalog.
- **Product page `/c/<link>/p/<sku>`:**
  - photos you can swipe, with full-screen zoom
  - video; specs (fabric, sizes, colours, set pieces, MOQ, stock, GST)
  - colour / size / full-set choice; quantity from MOQ up to available stock, with the total
  - Share, and "Order on WhatsApp" with the chosen options until the cart arrives in Milestone 6
- **Link settings respected:**
  - price-hidden links send no prices at all, only "Price on request"
  - hidden, inactive or removed products and the out-of-stock setting are respected
- **"Catalog not available"** for unknown or switched-off links, deactivated sellers and expired plans.
- **Live updates:**
  - pages are cached for speed and refreshed immediately when the sheet syncs or the seller changes products, links, profile or settings
  - WhatsApp link previews show the business or product name and photo

### Milestone 6 – Cart & checkout
- **Cart:**
  - "Add to cart" with colour / size / full set and quantity; a cart icon with the count in the catalog header
  - the cart shows lines, GST and the total
  - it re-checks prices and stock every time it opens, fixing what it can and explaining it; out-of-stock or removed items must be taken out before checkout
- **Checkout:**
  - mobile OTP, then delivery details (name, shop, city, address, GST, transport, notes); returning customers are pre-filled
  - payment as the seller allows: pay later, UPI (ID / QR shown) or bank transfer (details shown)
- **Placing the order:**
  - one safe database step: stock and MOQ are checked again with the products locked, so two buyers can never both get the last set
  - stock is held, the plan's monthly order limit and blocked customers are respected, and order numbers start at #1001 per seller
- **After ordering:**
  - an order page with a progress timeline, items, totals and how to pay
  - "My orders" on every link (OTP login); customers can cancel while the order is still "Order received", and the stock goes back
- **Price-hidden links:** customers never see prices; the seller's order still records them.
- The seller's dashboard shows a "New orders" count. The full orders screen is Milestone 7.

### Milestone 7 – Order management
- **New orders reach the seller straight away:** an "Orders" badge in the menu, a "New orders" card on the dashboard, and the count in the browser tab. They refresh on their own every 30 seconds. (WhatsApp alerts are on hold.)
- **Orders screen:** tabs for New, Confirmed, Packed, Dispatched, Delivered and Cancelled with counts; search by order number, customer, shop or mobile; a date range.
- **Order page:**
  - items with colour/size, GST and totals; the customer's details, address, notes and transport preference; history
  - one button for the next step: Confirm → Packed → Dispatched (with transport / LR note) → Delivered
  - reject or cancel with a reason the customer sees; the stock goes back
  - mark payment received
- **Documents:** order PDF, packing slip, and an Excel export of the filtered orders.
- **Google Sheet "Orders" tab:** when switched on in Settings, each order is written as rows and its status / payment kept up to date. Problems show on the order and are retried.
- **Customers:** the list (from orders, or added by hand) with orders and totals; assign catalog links; order history; block / unblock.

### Place Order flow update
- **"Place Order" instead of Checkout:** customers enter only their name, mobile and GST no. (optional). There's no OTP for now, and the order goes straight to the seller as New.
- **Purchase Order (PO) slip after every order:** the customer sees it at once and can download it as a PDF (through a private link for that order); the seller downloads the same PO from the order page.
- **Seller's orders list:** shows the customer's name and the catalog link the order came from, with a filter by link.
- **Order status simplified for now:** **New → Completed**, with one "Mark as completed" button. The detailed steps (Confirmed, Packed, Dispatched, Delivered, reject/cancel) are switched off, not removed: one setting brings them back.
- **Safety while OTP is off:** at most 15 orders per hour from one connection, and orders never overwrite a saved customer's details.

---

## Versions

### Runtime and services

| Component | Version in use | Notes |
|---|---|---|
| Node.js | **24.18.0** (via nvm) | `package.json` requires `>=22.12` |
| pnpm | **12.16.1** | Set in `packageManager` |
| PostgreSQL | **14.24** (local install) | `docker-compose.yml` offers `postgres:16-alpine` |
| Redis | **6.0.16** (local install) | `docker-compose.yml` offers `redis:7-alpine` |
| TypeScript | **5.9.3** | Pinned; TypeScript 7 (native compiler) isn't supported by the tooling yet |

### Database (Prisma)

| Package | Version |
|---|---|
| `prisma` (CLI) | **7.10.1** |
| `@prisma/client` | **7.10.1** |
| `@prisma/adapter-pg` | **7.10.1** |

Prisma 7 setup details:
- The connection URL is in `prisma.config.ts`, not in `schema.prisma`.
- The generator is `prisma-client`, with output to `packages/db/src/generated/prisma`.
- The client uses the `PrismaPg` driver adapter.

Migrations applied:
1. `20261029000000_init`
2. `20261029080300_sheet_connection_pending`
3. `20261029103424_client_profile`
4. `20261030061637_order_sheet_error`

### Web app (`apps/web`)

| Package | Version |
|---|---|
| next | 16.4.3 |
| react / react-dom | 19.3.1 |
| tailwindcss / @tailwindcss/postcss | 4.3.3 |
| jose | 6.2.13 |
| zod | 4.6.7 |
| eslint / eslint-config-next | 10.13.0 / 16.4.3 |

### Worker and shared logic (`apps/worker`, `packages/core`)

| Package | Version | Used for |
|---|---|---|
| bullmq | 6.5.1 | Job queues (sync, images, maintenance) |
| ioredis | 6.0.0 | Redis client, rate limits |
| pino | 10.4.0 | Worker logs |
| @googleapis/sheets | 18.1.1 | Read Google Sheets |
| @googleapis/drive | 27.0.0 | Drive files and folders |
| google-auth-library | 11.3.1 | OAuth and service account auth |
| sharp | 0.35.5 | Thumbnails (WebP) |
| exceljs | 4.4.0 | Sheet template and orders export (.xlsx) |
| pdfkit | 0.20.2 | Order PDF and packing slip (DejaVu Sans fonts bundled for ₹) |
| qrcode | 1.5.4 | Link QR codes |
| @node-rs/argon2 | 2.2.2 | Password hashing |
| jose | 6.2.13 | Session tokens |
| zod | 4.6.7 | Validation (`packages/validation`) |
| dotenv | 18.0.9 | Loading `.env` |

### Development tools

| Package | Version |
|---|---|
| vitest | 5.0.5 |
| tsx | 4.23.15 |
| prettier | 3.9.10 |
| @types/node | 24.19.2 |
| playwright-core + Google Chrome | Used for the end-to-end test runs (not yet part of the repo; added in Milestone 8) |

---

## Tests (latest run)

| Suite | Result |
|---|---|
| Unit tests (`pnpm test`) | 129 passed (validation 32, db 6, core 91) |
| Database tests (`pnpm test:db`) | 64 passed (db 6, core 58) |
| Type-check and lint | Clean |
| Browser tests at phone width (390 px) | M2: 21/21, M3: 16/16, M4: 17/17, M5: 14/14, M6: 16/16, M7: 14/14 |

---

## Waiting on

- **Google sign-in ("Connect Google account"):**
  - The credentials are in `.env`, and the service-account key is at `secrets/google-sa.json`. Both have been checked against Google.
  - The redirect URI is registered.
  - Google currently shows "Something went wrong" after Continue. This usually means Google is still applying a recent change, or the consent-screen / test-user setup needs a look.
- **Sharing a sheet with CatalogLink:** ready to try with a real sheet.
- **MSG91 auth key and DLT template:** needed for real OTP SMS. Until then OTPs are printed in the server log.
