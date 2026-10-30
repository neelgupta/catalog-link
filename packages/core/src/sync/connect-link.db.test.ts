import { randomInt, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { prisma } from "@cataloglink/db";
import { clientCreateSchema } from "@cataloglink/validation";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, deleteClient } from "../clients";
import { DomainError } from "../errors";
import { createPlan } from "../plans";
import { connectDemoGoogleAccount, connectSheetByLink } from "./connection";

// The demo Google account + fixture sheets stand in for real Google (DEMO_… ids).
process.env.GOOGLE_FAKE_DIR = resolve(import.meta.dirname, "../../../../dev-fixtures/google");
process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");

const run = randomUUID().slice(0, 6);
let clientId: string;
const link = (id: string, gid?: number) => `https://docs.google.com/spreadsheets/d/${id}/edit${gid === undefined ? "" : `#gid=${gid}`}`;

async function error(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    if (err instanceof DomainError) return { code: err.code, message: err.message };
    throw err;
  }
  return null;
}

beforeAll(async () => {
  const plan = await createPlan({ name: `Test ${run}`, maxProducts: 100, maxCustomLinks: 5, maxStaff: 0, maxOrdersPerMonth: 50, price: 0, durationDays: 365, isActive: true });
  clientId = (
    await createClient(
      clientCreateSchema.parse({ businessName: `Link ${run}`, ownerName: "R", mobile: `9${randomInt(100_000_000, 999_999_999)}`, email: `${randomUUID().slice(0, 8)}@test.local`, city: "Surat", password: "initial-pass", planId: plan.id }),
    )
  ).id;
});

afterAll(async () => {
  await deleteClient(clientId).catch(() => undefined);
  await prisma.plan.deleteMany({ where: { name: `Test ${run}` } });
  await prisma.$disconnect();
});

describe("connect a sheet by link (OAuth flow)", () => {
  it("needs the Google account first", async () => {
    expect((await error(connectSheetByLink(clientId, link("DEMO_catalog_sample_products"))))?.code).toBe("GOOGLE_NOT_CONNECTED");
  });

  it("refuses a link that isn't a Google Sheet", async () => {
    await connectDemoGoogleAccount(clientId);
    expect((await error(connectSheetByLink(clientId, "https://example.com/sheet")))?.code).toBe("BAD_SHEET_LINK");
  });

  it("explains when the account can't open the sheet", async () => {
    const e = await error(connectSheetByLink(clientId, link("DEMO_sheet_without_access_xx")));
    expect(e?.message).toContain("Your Google account (demo.account@example.com) can't open this spreadsheet");
  });

  it("uses the tab the link points at, and says which columns it lacks", async () => {
    const e = await error(connectSheetByLink(clientId, link("DEMO_shree_krishna_textiles_sheet", 1)));
    expect(e?.code).toBe("MISSING_COLUMNS");
    expect(e?.message).toContain('The tab "Notes" doesn\'t have the template\'s columns');
  });

  it("finds the products tab by its columns when the link has no tab, and saves the connection", async () => {
    const conn = await connectSheetByLink(clientId, link("DEMO_shree_krishna_textiles_sheet"));
    expect(conn).toMatchObject({ mode: "OAUTH", spreadsheetId: "DEMO_shree_krishna_textiles_sheet", sheetName: "Products", googleEmail: "demo.account@example.com" });
    expect(conn.oauthRefreshTokenEnc).toBeTruthy();
  });

  it("switches to another sheet with a gid=0 link", async () => {
    const conn = await connectSheetByLink(clientId, link("DEMO_catalog_sample_products", 0));
    expect(conn).toMatchObject({ spreadsheetId: "DEMO_catalog_sample_products", sheetName: "Products", spreadsheetTitle: "Sample Products – CatalogLink demo" });
  });
});
