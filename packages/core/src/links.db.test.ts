import { randomInt, randomUUID } from "node:crypto";
import { prisma, type Prisma } from "@cataloglink/db";
import { clientCreateSchema, clientSettingsSchema, linkCreateSchema, linkUpdateSchema, profileSchema } from "@cataloglink/validation";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, deleteClient } from "./clients";
import { DomainError } from "./errors";
import { countLinkProducts, createLink, deleteLink, linkUsage, updateLink } from "./links";
import { createPlan } from "./plans";
import { productFacets, setProductHidden } from "./products";
import { getClientSettings, parseBankDetails, updateClientSettings, updateProfile } from "./profile";

// Everything created here is unique to this run and removed afterwards.
const run = randomUUID().slice(0, 6);
const created: string[] = [];
let planId: string;

async function makeClient(name: string) {
  const c = await createClient(
    clientCreateSchema.parse({
      businessName: name,
      ownerName: "Ramesh",
      mobile: `9${randomInt(100_000_000, 999_999_999)}`,
      email: `${randomUUID().slice(0, 8)}@test.local`,
      city: "Surat",
      password: "initial-pass",
      planId,
    }),
  );
  created.push(c.id);
  return c;
}

let row = 1;
function product(clientId: string, sku: string, data: Partial<Prisma.ProductUncheckedCreateInput> = {}) {
  return prisma.product.create({
    data: { clientId, sku, name: sku, category: "Saree", price: 500, availableQty: 10, rowHash: sku, sheetRow: ++row, ...data },
  });
}

const link = (input: Record<string, unknown>) =>
  linkCreateSchema.parse({ name: "Link", selectionType: "ALL", showPrice: "on", allowOrdering: "on", isActive: "on", ...input });

async function domainCode(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    if (err instanceof DomainError) return err.code;
    throw err;
  }
  return null;
}

beforeAll(async () => {
  planId = (await createPlan({ name: `Test ${run}`, maxProducts: 100, maxCustomLinks: 2, maxStaff: 0, maxOrdersPerMonth: 50, price: 0, durationDays: 365, isActive: true })).id;
});

afterAll(async () => {
  for (const id of created) await deleteClient(id).catch(() => undefined);
  await prisma.plan.deleteMany({ where: { name: { startsWith: `Test ${run}` } } });
  await prisma.$disconnect();
});

describe("catalog links (Postgres)", () => {
  let clientId: string;
  let clientSlug: string;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const c = await makeClient(`Links ${run}`);
    clientId = c.id;
    clientSlug = c.slug;
    ids.saree = (await product(clientId, "SR-1", { catalogName: "Rangoli Vol-3" })).id;
    ids.sareeLower = (await product(clientId, "SR-2", { category: "saree" })).id;
    ids.kurti = (await product(clientId, "KR-1", { category: "Kurti", catalogName: "Summer Vol-1" })).id;
    ids.inactive = (await product(clientId, "KR-2", { category: "Kurti", sheetActive: false })).id;
    ids.removed = (await product(clientId, "KR-3", { category: "Kurti", removedFromSheetAt: new Date() })).id;
  });

  it("counts only visible products, matching names case-insensitively", async () => {
    expect(await countLinkProducts(clientId, { selectionType: "ALL", selectionValues: [] })).toBe(3);
    expect(await countLinkProducts(clientId, { selectionType: "CATEGORY", selectionValues: ["SAREE"] })).toBe(2);
    expect(await countLinkProducts(clientId, { selectionType: "CATALOG", selectionValues: ["summer vol-1"] })).toBe(1);
    expect(await countLinkProducts(clientId, { selectionType: "PRODUCTS", selectionValues: [ids.saree!, ids.inactive!] })).toBe(1);

    await setProductHidden(clientId, ids.saree!, true);
    expect(await countLinkProducts(clientId, { selectionType: "CATEGORY", selectionValues: ["Saree"] })).toBe(1);
    await setProductHidden(clientId, ids.saree!, false);
  });

  it("lists categories and catalogs of products still in the sheet", async () => {
    const facets = await productFacets(clientId);
    expect(facets.categories.map((c) => c.name)).toEqual(expect.arrayContaining(["Saree", "saree", "Kurti"]));
    expect(facets.categories.find((c) => c.name === "Kurti")?.count).toBe(2); // the removed one isn't counted
    expect(facets.catalogs).toEqual([
      { name: "Rangoli Vol-3", count: 1 },
      { name: "Summer Vol-1", count: 1 },
    ]);
  });

  it("generates a unique address from the business and link name", async () => {
    const l = await createLink(clientId, link({ name: "Wedding Sarees", selectionType: "CATEGORY", selectionValues: ["Saree", "saree"] }));
    expect(l.slug).toBe(`${clientSlug}-wedding-sarees`);
    expect(l.selectionValues).toEqual(["saree"]); // de-duplicated case-insensitively
    expect(l.isDefault).toBe(false);
  });

  it("refuses an address used by any client or link", async () => {
    expect(await domainCode(createLink(clientId, link({ slug: clientSlug })))).toBe("SLUG_TAKEN");
    expect(await domainCode(createLink(clientId, link({ slug: `${clientSlug}-wedding-sarees` })))).toBe("SLUG_TAKEN");
  });

  it("keeps only the client's own product ids", async () => {
    const other = await makeClient(`Other ${run}`);
    const foreign = await product(other.id, "X-1");
    const l = await createLink(clientId, link({ name: "Picked", slug: `picked-${run}`, selectionType: "PRODUCTS", selectionValues: [ids.kurti, foreign.id] }));
    expect(l.selectionValues).toEqual([ids.kurti]);
    expect(await domainCode(updateLink(clientId, l.id, linkUpdateSchema.parse({ name: "Picked", selectionType: "PRODUCTS", selectionValues: [foreign.id] })))).toBe("NO_PRODUCTS");
    // Another client can't edit or delete it.
    expect(await domainCode(updateLink(other.id, l.id, linkUpdateSchema.parse({ name: "x", selectionType: "ALL" })))).toBe("LINK_NOT_FOUND");
    expect(await domainCode(deleteLink(other.id, l.id))).toBe("LINK_NOT_FOUND");
  });

  it("enforces the plan's custom link limit", async () => {
    expect(await linkUsage(clientId)).toEqual({ used: 2, limit: 2 });
    expect(await domainCode(createLink(clientId, link({ name: "Third" })))).toBe("LINK_LIMIT");
  });

  it("keeps the default link showing all products, active and undeletable", async () => {
    const def = await prisma.catalogLink.findFirstOrThrow({ where: { clientId, isDefault: true } });
    const updated = await updateLink(
      clientId,
      def.id,
      linkUpdateSchema.parse({ name: "Everything", selectionType: "CATEGORY", selectionValues: ["Kurti"], showPrice: "", allowOrdering: "on", isActive: "" }),
    );
    expect(updated).toMatchObject({ name: "Everything", selectionType: "ALL", selectionValues: [], showPrice: false, isActive: true, slug: def.slug });
    expect(await domainCode(deleteLink(clientId, def.id))).toBe("DEFAULT_LINK");
  });

  it("frees a slot when a custom link is deleted", async () => {
    const custom = await prisma.catalogLink.findFirstOrThrow({ where: { clientId, isDefault: false } });
    await deleteLink(clientId, custom.id);
    expect((await linkUsage(clientId)).used).toBe(1);
  });
});

describe("profile and settings (Postgres)", () => {
  let clientId: string;
  const png = () => sharp({ create: { width: 8, height: 8, channels: 3, background: "#c2410c" } }).png().toBuffer();
  const profile = (input: Record<string, unknown>) =>
    profileSchema.parse({ businessName: "Profile Test", city: "Surat", paymentModes: ["PAY_LATER"], ...input });

  beforeAll(async () => {
    clientId = (await makeClient(`Profile ${run}`)).id;
  });

  it("needs a UPI ID or QR to accept UPI", async () => {
    expect(await domainCode(updateProfile(clientId, profile({ paymentModes: ["UPI"] })))).toBe("UPI_DETAILS_MISSING");
    const withQr = await updateProfile(clientId, profile({ paymentModes: ["UPI"] }), { upiQr: { upload: await png() } });
    expect(withQr.upiQrUrl).toMatch(new RegExp(`^/media/clients/${clientId}/upiQr-\\d+\\.png$`));
    // Removing the QR without a UPI ID is refused, and the QR is kept.
    expect(await domainCode(updateProfile(clientId, profile({ paymentModes: ["UPI"] }), { upiQr: { remove: true } }))).toBe("UPI_DETAILS_MISSING");
    expect((await prisma.client.findUniqueOrThrow({ where: { id: clientId } })).upiQrUrl).toBe(withQr.upiQrUrl);
  });

  it("saves contact, bank details and payment modes, and clears bank details", async () => {
    const saved = await updateProfile(
      clientId,
      profile({
        businessName: "Renamed Textiles",
        whatsappNumber: "+91 98765 00000",
        paymentModes: ["PAY_LATER", "BANK"],
        bankAccountName: "Renamed Textiles",
        bankAccountNumber: "5020 0012 3456",
        bankIfsc: "hdfc0001234",
      }),
      { banner: { upload: await png() } },
    );
    expect(saved).toMatchObject({ businessName: "Renamed Textiles", whatsappNumber: "9876500000", paymentModes: ["PAY_LATER", "BANK"] });
    expect(saved.bannerUrl).toContain("/banner-");
    expect(parseBankDetails(saved.bankDetails)).toEqual({ accountName: "Renamed Textiles", accountNumber: "502000123456", ifsc: "HDFC0001234" });

    const cleared = await updateProfile(clientId, profile({}), { banner: { remove: true } });
    expect(cleared.bankDetails).toBeNull();
    expect(cleared.bannerUrl).toBeNull();
  });

  it("rejects a non-image upload", async () => {
    expect(await domainCode(updateProfile(clientId, profile({}), { logo: { upload: Buffer.from("not an image") } }))).toBe("IMAGE_TYPE");
  });

  it("stores settings, falls back to platform defaults and keeps other keys", async () => {
    await prisma.client.update({ where: { id: clientId }, data: { settings: { futureKey: 1 } } });
    const before = await getClientSettings(clientId);
    expect(before).toMatchObject({ outOfStockMode: "badge", lowStockThreshold: 0, writeOrdersTab: false, syncIntervalMin: null });
    expect(before.effectiveSyncIntervalMin).toBe(before.platform.defaultSyncIntervalMin);

    await updateClientSettings(clientId, clientSettingsSchema.parse({ outOfStockMode: "hide", lowStockThreshold: "5", writeOrdersTab: "on", syncIntervalMin: "15", newArrivalDays: "" }));
    const after = await getClientSettings(clientId);
    expect(after).toMatchObject({ outOfStockMode: "hide", lowStockThreshold: 5, writeOrdersTab: true, syncIntervalMin: 15, newArrivalDays: null, effectiveSyncIntervalMin: 15 });
    expect((await prisma.client.findUniqueOrThrow({ where: { id: clientId } })).settings).toMatchObject({ futureKey: 1 });
  });
});
