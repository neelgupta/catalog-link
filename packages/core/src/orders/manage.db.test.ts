import { randomInt, randomUUID } from "node:crypto";
import { prisma } from "@cataloglink/db";
import { checkoutSchema, clientCreateSchema, customerSchema } from "@cataloglink/validation";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type CatalogContext, resolveCatalogLink } from "../catalog";
import { createClient, deleteClient } from "../clients";
import { createCustomer, getCustomer, listCustomers, setCustomerBlocked, updateCustomer } from "../customers";
import { DomainError } from "../errors";
import type { CellValue, GoogleSource } from "../google/source";
import { createPlan } from "../plans";
import { placeOrder } from "./checkout";
import { orderPdf, ordersWorkbook } from "./documents";
import { changeOrderStatus, getOrder, listOrders, newOrderCount, setPaymentReceived } from "./manage";
import { ORDER_SHEET_HEADERS, writeOrderToSheet } from "./sheet-writer";

const run = randomUUID().slice(0, 6);
let ctx: CatalogContext;
let clientId: string;
let productId: string;
const qty = async () => (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).availableQty;
const order = (mobile: string, name = "Mahesh Shah", n = 2) =>
  placeOrder(ctx, mobile, checkoutSchema.parse({ name, shopName: "Shah Sarees", city: "Ahmedabad", deliveryAddress: "12, Relief Road, Ahmedabad", paymentMode: "PAY_LATER", lines: [{ productId, colour: "Red", qty: n, price: 850 }] }));

async function code(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    if (err instanceof DomainError) return err.code;
    throw err;
  }
  return null;
}

beforeAll(async () => {
  const plan = await createPlan({ name: `Test ${run}`, maxProducts: 100, maxCustomLinks: 5, maxStaff: 0, maxOrdersPerMonth: 50, price: 0, durationDays: 365, isActive: true });
  const c = await createClient(
    clientCreateSchema.parse({ businessName: `Orders ${run}`, ownerName: "R", mobile: `9${randomInt(100_000_000, 999_999_999)}`, email: `${randomUUID().slice(0, 8)}@test.local`, city: "Surat", password: "initial-pass", planId: plan.id }),
  );
  clientId = c.id;
  ctx = (await resolveCatalogLink(c.slug))!;
  productId = (await prisma.product.create({ data: { clientId, sku: "SR-1", name: "Banarasi Saree", category: "Saree", price: 850, gstPct: 5, moq: 2, availableQty: 20, colours: ["Red"], rowHash: "x", sheetRow: 2 } })).id;
});

afterAll(async () => {
  await deleteClient(clientId).catch(() => undefined);
  await prisma.plan.deleteMany({ where: { name: `Test ${run}` } });
  await prisma.$disconnect();
});

describe("order management (Postgres)", () => {
  let a: string;
  let b: string;

  it("lists new orders by tab with counts and search", async () => {
    a = (await order("9811111111", "Mahesh Shah")).id;
    b = (await order("9822222222", "Kiran Textiles", 4)).id;
    expect(await newOrderCount(clientId)).toBe(2);
    const all = await listOrders(clientId, { tab: "new" });
    expect(all.orders.map((o) => o.orderNo)).toEqual([1002, 1001]);
    expect(all.counts).toMatchObject({ new: 2, confirmed: 0, all: 2 });
    expect((await listOrders(clientId, { tab: "all", q: "kiran" })).orders.map((o) => o.orderNo)).toEqual([1002]);
    expect((await listOrders(clientId, { tab: "all", q: "#1001" })).orders.map((o) => o.orderNo)).toEqual([1001]);
    expect((await listOrders(clientId, { tab: "all", q: "1111" })).orders.map((o) => o.orderNo)).toEqual([1001]);
    expect((await listOrders(clientId, { tab: "all", from: "2000-01-01", to: "2000-01-02" })).total).toBe(0);
  });

  it("moves an order through confirmed, packed, dispatched and delivered, keeping history", async () => {
    await changeOrderStatus(clientId, a, "CONFIRMED", { userId: "u1" });
    await changeOrderStatus(clientId, a, "PACKED");
    await changeOrderStatus(clientId, a, "DISPATCHED", { note: "VRL LR 4471" });
    await changeOrderStatus(clientId, a, "DELIVERED");
    const o = await getOrder(clientId, a);
    expect(o?.history.map((h) => h.toStatus)).toEqual(["PLACED", "CONFIRMED", "PACKED", "DISPATCHED", "DELIVERED"]);
    expect(o?.history[1]?.byUserId).toBe("u1");
    expect(o?.history[3]?.note).toBe("VRL LR 4471");
    expect(await code(changeOrderStatus(clientId, a, "CANCELLED", { reason: "x" }))).toBe("BAD_TRANSITION");
  });

  it("rejecting needs a reason and gives the stock back; another client can't touch it", async () => {
    const before = await qty();
    expect(await code(changeOrderStatus(clientId, b, "REJECTED"))).toBe("REASON_REQUIRED");
    const other = await createClient(
      clientCreateSchema.parse({ businessName: `Other ${run}`, ownerName: "R", mobile: `9${randomInt(100_000_000, 999_999_999)}`, email: `${randomUUID().slice(0, 8)}@test.local`, city: "Surat", password: "initial-pass", planId: (await prisma.plan.findFirstOrThrow({ where: { name: `Test ${run}` } })).id }),
    );
    expect(await code(changeOrderStatus(other.id, b, "CONFIRMED"))).toBe("ORDER_NOT_FOUND");
    await deleteClient(other.id);

    await changeOrderStatus(clientId, b, "REJECTED", { reason: "Colour discontinued" });
    expect(await qty()).toBe(before + 4);
    expect(await getOrder(clientId, b)).toMatchObject({ status: "REJECTED", rejectReason: "Colour discontinued" });
    expect(await code(setPaymentReceived(clientId, b, true))).toBe("ORDER_CLOSED");
  });

  it("marks payment received", async () => {
    await setPaymentReceived(clientId, a, true);
    expect((await getOrder(clientId, a))?.paymentReceived).toBe(true);
  });

  it("writes an order to the Orders tab once, then only updates payment and status", async () => {
    await prisma.sheetConnection.create({ data: { clientId, mode: "SERVICE_ACCOUNT", spreadsheetId: "sheet-1", sheetName: "Products" } });
    await prisma.client.update({ where: { id: clientId }, data: { settings: { writeOrdersTab: true } } });
    const tabs = new Map<string, string[][]>();
    const fake = {
      async ensureTab(_id: string, tab: string, headers: string[]) {
        if (!tabs.get(tab)?.length) tabs.set(tab, [headers]);
      },
      async readValues(_id: string, tab: string) {
        return (tabs.get(tab) ?? []).map((r) => [...r]);
      },
      async appendRows(_id: string, tab: string, rows: CellValue[][]) {
        tabs.get(tab)!.push(...rows.map((r) => r.map(String)));
      },
      async updateCells(_id: string, tab: string, updates: { range: string; values: CellValue[][] }[]) {
        for (const u of updates) {
          const row = Number(u.range.match(/\d+/)![0]) - 1;
          tabs.get(tab)![row]!.splice(15, 2, ...u.values[0]!.map(String));
        }
      },
    } as unknown as GoogleSource;

    expect(await writeOrderToSheet(a, fake)).toBe("appended");
    const rows = tabs.get("Orders")!;
    expect(rows[0]).toEqual(ORDER_SHEET_HEADERS);
    expect(rows[1]).toMatchObject(["1001", expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/), "Mahesh Shah", "Shah Sarees", "9811111111", "Ahmedabad", "SR-1", "Banarasi Saree", "Red", "", "2", "850", "1700", "1785", "Pay later", "Yes", "Delivered"]);
    expect((await getOrder(clientId, a))?.sheetWrittenAt).toBeTruthy();

    await setPaymentReceived(clientId, a, false);
    expect(await writeOrderToSheet(a, fake)).toBe("updated");
    expect(tabs.get("Orders")).toHaveLength(2);
    expect(tabs.get("Orders")![1]!.slice(15)).toEqual(["No", "Delivered"]);

    await prisma.client.update({ where: { id: clientId }, data: { settings: { writeOrdersTab: false } } });
    expect(await writeOrderToSheet(a, fake)).toBe("skipped");
  });

  it("records a sheet error on the order and rethrows it for a retry", async () => {
    await prisma.client.update({ where: { id: clientId }, data: { settings: { writeOrdersTab: true } } });
    const broken = { ensureTab: async () => Promise.reject(Object.assign(new Error("The caller does not have permission"), { status: 403 })) } as unknown as GoogleSource;
    await expect(writeOrderToSheet(a, broken)).rejects.toThrow();
    expect((await getOrder(clientId, a))?.sheetError).toContain("can't write to your sheet");
  });

  it("makes an order PDF, a packing slip and an Excel export", async () => {
    const pdf = await orderPdf(clientId, a, "order");
    const slip = await orderPdf(clientId, a, "packing");
    expect(pdf!.subarray(0, 5).toString()).toBe("%PDF-");
    expect(slip!.subarray(0, 5).toString()).toBe("%PDF-");
    expect(await orderPdf(clientId, "missing", "order")).toBeNull();
    const xlsx = await ordersWorkbook(clientId, { tab: "all" });
    expect(xlsx.subarray(0, 2).toString()).toBe("PK"); // a zip, like every .xlsx
  });
});

describe("customers (Postgres)", () => {
  it("lists customers from orders with totals; adds, edits, assigns links and blocks", async () => {
    const list = await listCustomers(clientId);
    const mahesh = list.customers.find((c) => c.mobile === "9811111111")!;
    expect(mahesh).toMatchObject({ orderCount: 1, totalSpent: 1785, source: "ORDER" });
    expect(list.customers.find((c) => c.mobile === "9822222222")?.totalSpent).toBe(0); // its only order was rejected

    const linkId = ctx.link.id;
    const added = await createCustomer(clientId, customerSchema.parse({ name: "Walk-in Retailer", mobile: "9833333333", city: "Surat", linkIds: [linkId, "not-mine"] }));
    expect(added.source).toBe("MANUAL");
    expect((await getCustomer(clientId, added.id))?.links.map((l) => l.link.id)).toEqual([linkId]);
    expect(await code(createCustomer(clientId, customerSchema.parse({ name: "Dup", mobile: "9833333333" })))).toBe("MOBILE_TAKEN");

    await updateCustomer(clientId, added.id, customerSchema.parse({ name: "Walk-in Retailer", mobile: "9844444444", linkIds: [] }));
    expect(await getCustomer(clientId, added.id)).toMatchObject({ mobile: "9844444444", links: [] });
    expect(await code(updateCustomer(clientId, mahesh.id, customerSchema.parse({ name: "M", mobile: "9800000000" })))).toBe("MOBILE_LOCKED");

    await setCustomerBlocked(clientId, mahesh.id, true);
    expect((await listCustomers(clientId, { blocked: true })).customers.map((c) => c.id)).toEqual([mahesh.id]);
    expect((await listCustomers(clientId, { q: "walk" })).total).toBe(1);
  });
});

