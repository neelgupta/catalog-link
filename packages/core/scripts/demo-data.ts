// DEVELOPMENT ONLY: fills a client with dummy products by syncing the sample fixture sheet through the
// real sync + thumbnail pipeline (no Google account needed).
//
//   pnpm demo:data                  creates/refreshes the demo client "Shree Krishna Textiles (Demo)"
//   pnpm demo:data --client <slug>  loads the sample products into an existing client instead
//
// Re-running is safe: it syncs again, so products are updated rather than duplicated.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { config } from "dotenv";

const repoRoot = resolve(import.meta.dirname, "../../..");
config({ path: resolve(repoRoot, ".env"), quiet: true });
process.env.MEDIA_DIR ??= resolve(repoRoot, "media");
if (process.env.NODE_ENV === "production") throw new Error("demo:data is for development only");

const { prisma } = await import("@cataloglink/db");
const { createClient } = await import("../src/clients");
const { FakeGoogleSource } = await import("../src/google/fake-source");
const { processImage } = await import("../src/images/process");
const { createLink, linkUsage } = await import("../src/links");
const { runSync } = await import("../src/sync/run");
const { revalidateCatalog } = await import("../src/sync/schedule");

const SHEET_ID = "DEMO_catalog_sample_products";
const fixturesDir = resolve(repoRoot, "dev-fixtures/google");
const DEMO = {
  businessName: "Shree Krishna Textiles (Demo)",
  ownerName: "Ramesh Patel",
  email: "demo@cataloglink.local",
  mobile: "9999900001",
  password: "Demo@12345",
  city: "Surat",
  address: "Shop 214, Surat Textile Market, Ring Road, Surat 395002",
};

const { values: args } = parseArgs({ options: { client: { type: "string" } } });

if (!existsSync(resolve(fixturesDir, "sheets", `${SHEET_ID}.json`))) {
  throw new Error("Sample fixtures are missing. Run: pnpm --filter @cataloglink/core dev:fixtures");
}

async function demoClient() {
  const existing = await prisma.user.findUnique({ where: { email: DEMO.email }, select: { clientId: true } });
  if (existing?.clientId) return { id: existing.clientId, created: false };

  const plan = await prisma.plan.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
  if (!plan) throw new Error("No active plan. Run pnpm db:seed first.");
  const client = await createClient({
    businessName: DEMO.businessName,
    ownerName: DEMO.ownerName,
    mobile: DEMO.mobile,
    email: DEMO.email,
    city: DEMO.city,
    address: DEMO.address,
    gst: "24AAACR5055K1Z5",
    password: DEMO.password,
    planId: plan.id,
    trialDays: 0,
  });
  await prisma.client.update({
    where: { id: client.id },
    data: {
      whatsappNumber: DEMO.mobile,
      upiId: "shreekrishna@okhdfcbank",
      paymentModes: ["PAY_LATER", "UPI", "BANK"],
      bankDetails: { accountName: "Shree Krishna Textiles", accountNumber: "50200012345678", ifsc: "HDFC0001234", bankName: "HDFC Bank", branch: "Ring Road, Surat" },
      settings: { outOfStockMode: "badge", lowStockThreshold: 5 },
    },
  });
  return { id: client.id, created: true };
}

async function targetClient() {
  if (!args.client) return demoClient();
  const client = await prisma.client.findUnique({ where: { slug: args.client }, select: { id: true } });
  if (!client) throw new Error(`No client with slug "${args.client}"`);
  return { id: client.id, created: false };
}

const { id: clientId, created } = await targetClient();

const connection = await prisma.sheetConnection.findUnique({ where: { clientId } });
if (connection?.spreadsheetId && !connection.spreadsheetId.startsWith("DEMO_")) {
  throw new Error("This client is connected to a real Google Sheet. Disconnect it first (Google Sheet page) to load demo data.");
}
const sheet = { mode: "SERVICE_ACCOUNT" as const, spreadsheetId: SHEET_ID, spreadsheetTitle: "Sample Products – CatalogLink demo", sheetName: "Products", googleEmail: null, oauthRefreshTokenEnc: null };
await prisma.sheetConnection.upsert({ where: { clientId }, update: sheet, create: { clientId, ...sheet } });

const source = new FakeGoogleSource(fixturesDir);
const imageIds: string[] = [];
const result = await runSync(clientId, "MANUAL", { source, enqueueImages: async (ids) => void imageIds.push(...ids) });
if (result.status === "FAILED") throw new Error(`Sync failed: ${result.message}`);

// Thumbnails, 4 at a time (the worker would do this in the background).
const queue = [...imageIds];
const outcomes: Record<string, number> = {};
await Promise.all(
  Array.from({ length: 4 }, async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      const outcome = await processImage(id, source);
      outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
    }
  }),
);

// Products appear "new" for a few days after they're first synced; spread the dummy products over the
// last two months so only the ones tagged "New Arrival" look new.
const fresh = await prisma.product.findMany({
  where: { clientId, firstSeenAt: { gt: new Date(Date.now() - 60 * 60_000) }, NOT: { tags: { has: "New Arrival" } } },
  select: { id: true },
  orderBy: { sheetRow: "asc" },
});
for (const [i, p] of fresh.entries()) {
  await prisma.product.update({ where: { id: p.id }, data: { firstSeenAt: new Date(Date.now() - (10 + ((i * 7) % 50)) * 86_400_000) } });
}

// A few custom links, when the client has none yet.
const links: string[] = [];
const { used, limit } = await linkUsage(clientId);
if (used === 0 && limit > 0) {
  const samples = [
    { name: "Bridal Collection", selectionType: "CATALOG" as const, selectionValues: ["Bridal Edit 2026"], showPrice: true },
    { name: "Kurtis – Summer", selectionType: "CATEGORY" as const, selectionValues: ["Kurti"], showPrice: true },
    { name: "Sarees (price on request)", selectionType: "CATEGORY" as const, selectionValues: ["Saree"], showPrice: false },
  ];
  for (const s of samples.slice(0, limit)) {
    const link = await createLink(clientId, { ...s, allowOrdering: true, isActive: true });
    links.push(link.slug);
  }
}

await revalidateCatalog(clientId);

const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { businessName: true, slug: true } });
const products = await prisma.product.count({ where: { clientId, removedFromSheetAt: null } });
const appUrl = process.env.APP_URL ?? "http://localhost:3000";
console.log(`
Demo data loaded for "${client.businessName}"
  Sync:        ${result.status}${result.message ? ` (${result.message})` : ""}
  Products:    ${products} in the sheet (2 are marked Active = No)
  Thumbnails:  ${Object.entries(outcomes).map(([k, v]) => `${v} ${k}`).join(", ") || "all up to date"}
  Links:       ${links.length ? links.map((s) => `${appUrl}/c/${s}`).join("\n               ") : "kept existing links"}
  Default:     ${appUrl}/c/${client.slug}
${created || !args.client ? `  Login:       ${DEMO.email} / ${DEMO.password}  (or OTP to ${DEMO.mobile})\n` : ""}`);

await prisma.$disconnect();
