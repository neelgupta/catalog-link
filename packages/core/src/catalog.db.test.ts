import { randomInt, randomUUID } from "node:crypto";
import { prisma, type Prisma } from "@cataloglink/db";
import { clientCreateSchema, linkCreateSchema } from "@cataloglink/validation";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadCatalogProduct, loadCatalogSnapshot, resolveCatalogLink } from "./catalog";
import { createClient, deleteClient } from "./clients";
import { createLink } from "./links";
import { createPlan } from "./plans";

// Everything created here is unique to this run and removed afterwards.
const run = randomUUID().slice(0, 6);
let clientId: string;
let slug: string;
let row = 1;

const product = (sku: string, data: Partial<Prisma.ProductUncheckedCreateInput> = {}) =>
  prisma.product.create({
    data: { clientId, sku, name: sku, category: "Saree", price: 850, mrp: 1499, availableQty: 10, rowHash: sku, sheetRow: ++row, ...data },
  });

beforeAll(async () => {
  const plan = await createPlan({ name: `Test ${run}`, maxProducts: 100, maxCustomLinks: 5, maxStaff: 0, maxOrdersPerMonth: 50, price: 0, durationDays: 365, isActive: true });
  const c = await createClient(
    clientCreateSchema.parse({
      businessName: `Catalog ${run}`,
      ownerName: "Ramesh",
      mobile: `9${randomInt(100_000_000, 999_999_999)}`,
      email: `${randomUUID().slice(0, 8)}@test.local`,
      city: "Surat",
      password: "initial-pass",
      planId: plan.id,
    }),
  );
  clientId = c.id;
  slug = c.slug;
  const sr = await product("SR-1", { catalogName: "Rangoli", tags: ["New Arrival"], firstSeenAt: new Date(Date.now() - 60 * 86_400_000) });
  await prisma.productImage.createMany({
    data: [
      { clientId, productId: sr.id, position: 1, status: "READY", thumbUrl: "/media/b-400.webp", fullUrl: "/media/b-1200.webp" },
      { clientId, productId: sr.id, position: 0, status: "READY", thumbUrl: "/media/a-400.webp", fullUrl: "/media/a-1200.webp" },
      { clientId, productId: sr.id, position: 2, status: "FAILED" },
    ],
  });
  await product("SR-OUT", { availableQty: 0 });
  await product("KR-1", { category: "Kurti", firstSeenAt: new Date(Date.now() - 60 * 86_400_000) });
  await product("HIDDEN", { hiddenByClient: true });
  await product("INACTIVE", { sheetActive: false });
  await product("REMOVED", { removedFromSheetAt: new Date() });
});

afterAll(async () => {
  await deleteClient(clientId).catch(() => undefined);
  await prisma.plan.deleteMany({ where: { name: `Test ${run}` } });
  await prisma.$disconnect();
});

describe("public catalog (Postgres)", () => {
  it("resolves an active link and refuses switched-off links, inactive clients and expired plans", async () => {
    const ctx = await resolveCatalogLink(slug);
    expect(ctx?.client).toMatchObject({ id: clientId, businessName: `Catalog ${run}` });
    expect(ctx?.link.isDefault).toBe(true);
    expect(await resolveCatalogLink("Not A Slug!")).toBeNull();
    expect(await resolveCatalogLink(`missing-${run}`)).toBeNull();

    const later = new Date(Date.now() + 400 * 86_400_000);
    expect(await resolveCatalogLink(slug, later)).toBeNull(); // plan expired by then

    await prisma.client.update({ where: { id: clientId }, data: { status: "INACTIVE" } });
    expect(await resolveCatalogLink(slug)).toBeNull();
    await prisma.client.update({ where: { id: clientId }, data: { status: "ACTIVE" } });

    const off = await createLink(clientId, linkCreateSchema.parse({ name: "Off", slug: `off-${run}`, selectionType: "ALL", showPrice: "on", allowOrdering: "on" }));
    expect(off.isActive).toBe(false);
    expect(await resolveCatalogLink(off.slug)).toBeNull();
  });

  it("lists only visible products, with the first ready photo, badges and prices", async () => {
    const snap = await loadCatalogSnapshot((await resolveCatalogLink(slug))!);
    expect(snap.items.map((p) => p.sku)).toEqual(["SR-1", "SR-OUT", "KR-1"]);
    const sr = snap.items[0]!;
    expect(sr).toMatchObject({ price: 850, mrp: 1499, isNew: true, image: { thumbUrl: "/media/a-400.webp" } });
    expect(snap.items[2]).toMatchObject({ isNew: false, image: null });
    expect(snap.items[1]!.isNew).toBe(true); // first seen just now
  });

  it("hides out-of-stock products when the client chose 'hide'", async () => {
    await prisma.client.update({ where: { id: clientId }, data: { settings: { outOfStockMode: "hide", lowStockThreshold: 3 } } });
    const snap = await loadCatalogSnapshot((await resolveCatalogLink(slug))!);
    expect(snap.items.map((p) => p.sku)).toEqual(["SR-1", "KR-1"]);
    expect(snap.lowStockThreshold).toBe(3);
    await prisma.client.update({ where: { id: clientId }, data: { settings: {} } });
  });

  it("leaves prices out of the data on a price-hidden link and applies the link's selection", async () => {
    const link = await createLink(clientId, linkCreateSchema.parse({ name: "Sarees", slug: `sarees-${run}`, selectionType: "CATEGORY", selectionValues: ["saree"], allowOrdering: "on", isActive: "on" }));
    const ctx = (await resolveCatalogLink(link.slug))!;
    expect(ctx.link.showPrice).toBe(false);
    const snap = await loadCatalogSnapshot(ctx);
    expect(snap.items.map((p) => p.sku)).toEqual(["SR-1", "SR-OUT"]);
    expect(snap.items.every((p) => p.price === null && p.mrp === null)).toBe(true);
    expect(JSON.stringify(snap)).not.toContain("850");

    expect(await loadCatalogProduct(ctx, "KR-1")).toBeNull(); // not on this link
    expect((await loadCatalogProduct(ctx, "SR-1"))?.price).toBeNull();
  });

  it("loads a product with all ready photos in order, and refuses hidden ones", async () => {
    const ctx = (await resolveCatalogLink(slug))!;
    const p = await loadCatalogProduct(ctx, "SR-1");
    expect(p?.images.map((i) => i.fullUrl)).toEqual(["/media/a-1200.webp", "/media/b-1200.webp"]);
    for (const sku of ["HIDDEN", "INACTIVE", "REMOVED", "NOPE"]) expect(await loadCatalogProduct(ctx, sku)).toBeNull();
  });
});
