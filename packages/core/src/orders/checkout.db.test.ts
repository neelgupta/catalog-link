import { randomInt, randomUUID } from "node:crypto";
import { prisma, type Prisma } from "@cataloglink/db";
import { checkoutSchema, clientCreateSchema, linkCreateSchema } from "@cataloglink/validation";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type CatalogContext, resolveCatalogLink } from "../catalog";
import { createClient, deleteClient } from "../clients";
import { DomainError } from "../errors";
import { createLink } from "../links";
import { createPlan } from "../plans";
import { CheckoutConflict, placeOrder as placeOrderWith, validateCart } from "./checkout";
import { cancelOrderByCustomer, getCustomerOrder, listCustomerOrders } from "./customer";

// Everything created here is unique to this run and removed afterwards.
const run = randomUUID().slice(0, 6);
const clients: string[] = [];
let planId: string;

async function makeClient(name: string, maxOrdersPerMonth = 50) {
  const plan = maxOrdersPerMonth === 50 ? planId : (await createPlan({ name: `Test ${run} ${name}`, maxProducts: 100, maxCustomLinks: 5, maxStaff: 0, maxOrdersPerMonth, price: 0, durationDays: 365, isActive: true })).id;
  const c = await createClient(
    clientCreateSchema.parse({ businessName: `${name} ${run}`, ownerName: "R", mobile: `9${randomInt(100_000_000, 999_999_999)}`, email: `${randomUUID().slice(0, 8)}@test.local`, city: "Surat", password: "initial-pass", planId: plan }),
  );
  clients.push(c.id);
  await prisma.client.update({ where: { id: c.id }, data: { paymentModes: ["PAY_LATER", "UPI"] } });
  return c;
}

let row = 1;
const product = (clientId: string, sku: string, data: Partial<Prisma.ProductUncheckedCreateInput> = {}) =>
  prisma.product.create({ data: { clientId, sku, name: sku, category: "Saree", price: 850, gstPct: 5, availableQty: 20, moq: 2, rowHash: sku, sheetRow: ++row, ...data } });

const details = { name: "Mahesh Shah", shopName: "Shah Sarees", city: "Ahmedabad", deliveryAddress: "12, Relief Road, Ahmedabad 380001", paymentMode: "PAY_LATER" };
const order = (lines: object[], extra: object = {}) => checkoutSchema.parse({ mobile: "9800000001", ...details, ...extra, lines });
/** placeOrder with the mobile passed separately, as the tests were written. */
const placeOrder = (ctx: CatalogContext, mobile: string, input: ReturnType<typeof order>) => placeOrderWith(ctx, { ...input, mobile });
const qtyOf = async (id: string) => (await prisma.product.findUniqueOrThrow({ where: { id } })).availableQty;

async function domainCode(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    if (err instanceof DomainError) return err.code;
    if (err instanceof CheckoutConflict) return "CONFLICT";
    throw err;
  }
  return null;
}

beforeAll(async () => {
  planId = (await createPlan({ name: `Test ${run}`, maxProducts: 100, maxCustomLinks: 5, maxStaff: 0, maxOrdersPerMonth: 50, price: 0, durationDays: 365, isActive: true })).id;
});

afterAll(async () => {
  for (const id of clients) await deleteClient(id).catch(() => undefined);
  await prisma.plan.deleteMany({ where: { name: { startsWith: `Test ${run}` } } });
  await prisma.$disconnect();
});

describe("checkout (Postgres)", () => {
  let ctx: CatalogContext;
  const ids: Record<string, string> = {};
  const mobile = "9812345678";

  beforeAll(async () => {
    const c = await makeClient("Checkout");
    ctx = (await resolveCatalogLink(c.slug))!;
    ids.saree = (await product(c.id, "SR-1", { colours: ["Red", "Green"] })).id;
    ids.set = (await product(c.id, "KR-1", { priceType: "SET", price: 2400, moq: 1, availableQty: 5, colours: ["Yellow", "Pink"], sizes: ["M", "L"], piecesPerSet: 4 })).id;
    ids.gown = (await product(c.id, "GW-1", { price: 1450, gstPct: null, moq: 1, sizes: ["M", "L"], availableQty: 3 })).id;
    ids.hidden = (await product(c.id, "HID", { hiddenByClient: true })).id;
    ids.last = (await product(c.id, "LAST", { moq: 1, availableQty: 1 })).id;
  });

  it("validates a cart: variants, MOQ, stock shared between lines, price changes, removed products", async () => {
    const cart = await validateCart(ctx, [
      { productId: ids.saree!, colour: "red", qty: 1, price: 850 }, // below MOQ 2, colour case fixed
      { productId: ids.saree!, colour: "Green", qty: 25, price: 800 }, // stock left 18 after the red line; price changed
      { productId: ids.set!, qty: 1 }, // set with several colours defaults to "Full set"? no: must choose
      { productId: ids.gown!, size: "XL", qty: 1 },
      { productId: ids.hidden!, qty: 2 },
    ]);
    const [red, green, set, gown, hidden] = cart.lines;
    expect(red).toMatchObject({ colour: "Red", qty: 2, issues: ["below_moq"] });
    expect(green).toMatchObject({ qty: 18, issues: ["qty_reduced", "price_changed"] });
    expect(set!.issues).toEqual(["variant_required"]);
    expect(gown!.issues).toEqual(["variant_invalid"]);
    expect(hidden!.issues).toEqual(["removed"]);
    expect(cart.hasIssues).toBe(true);
  });

  it("places an order: order number, GST totals, stock held, customer saved, history", async () => {
    const o = await placeOrder(ctx, mobile, order([
      { productId: ids.saree, colour: "Red", qty: 4, price: 850 },
      { productId: ids.set, colour: "Full set", qty: 2, price: 2400 },
      { productId: ids.gown, size: "L", qty: 1, price: 1450 },
    ], { gst: "24aaacr5055k1z5", transportPref: "VRL", notes: "Pack carefully" }));
    expect(o.orderNo).toBe(1001);
    // 3400 + 4800 at 5% GST, 1450 without GST
    expect(Number(o.subtotal)).toBe(9650);
    expect(Number(o.gstTotal)).toBe(410);
    expect(Number(o.grandTotal)).toBe(10060);
    expect(await qtyOf(ids.saree!)).toBe(16);
    expect(await qtyOf(ids.set!)).toBe(3);
    expect(await qtyOf(ids.gown!)).toBe(2);

    const full = await getCustomerOrder(ctx.client.id, mobile, 1001);
    expect(full?.items.map((i) => [i.sku, i.colour, i.size, i.qty, Number(i.lineTotal)])).toEqual([
      ["SR-1", "Red", null, 4, 3400],
      ["KR-1", "Full set", null, 2, 4800],
      ["GW-1", null, "L", 1, 1450],
    ]);
    expect(full?.history.map((h) => h.toStatus)).toEqual(["PLACED"]);
    expect(full).toMatchObject({ gst: "24AAACR5055K1Z5", transportPref: "VRL", status: "PLACED", linkId: ctx.link.id });
    const customer = await prisma.customer.findUniqueOrThrow({ where: { clientId_mobile: { clientId: ctx.client.id, mobile } } });
    expect(customer).toMatchObject({ name: "Mahesh Shah", shopName: "Shah Sarees", source: "ORDER" });
  });

  it("numbers orders in sequence and updates the same customer", async () => {
    const o = await placeOrder(ctx, mobile, order([{ productId: ids.saree, colour: "Green", qty: 2, price: 850 }], { name: "Mahesh S." }));
    expect(o.orderNo).toBe(1002);
    expect(await prisma.customer.count({ where: { clientId: ctx.client.id } })).toBe(1);
    expect((await listCustomerOrders(ctx.client.id, mobile)).map((x) => x.orderNo)).toEqual([1002, 1001]);
  });

  it("rejects a changed cart without touching stock or creating anything", async () => {
    const before = await qtyOf(ids.saree!);
    expect(await domainCode(placeOrder(ctx, mobile, order([{ productId: ids.saree, colour: "Red", qty: 2, price: 900 }])))).toBe("CONFLICT");
    expect(await domainCode(placeOrder(ctx, mobile, order([{ productId: ids.saree, colour: "Red", qty: 999, price: 850 }])))).toBe("CONFLICT");
    expect(await qtyOf(ids.saree!)).toBe(before);
    expect(await prisma.order.count({ where: { clientId: ctx.client.id } })).toBe(2);
  });

  it("sells the last set to exactly one of two buyers checking out at the same time", async () => {
    const results = await Promise.allSettled([
      placeOrder(ctx, "9811111111", order([{ productId: ids.last, qty: 1, price: 850 }])),
      placeOrder(ctx, "9822222222", order([{ productId: ids.last, qty: 1, price: 850 }])),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(CheckoutConflict);
    expect((rejected.reason as CheckoutConflict).lines[0]!.issues).toEqual(["out_of_stock"]);
    expect(await qtyOf(ids.last!)).toBe(0);
  });

  it("refuses payment modes the seller doesn't take, blocked customers and switched-off ordering", async () => {
    const lines = [{ productId: ids.saree, colour: "Red", qty: 2, price: 850 }];
    expect(await domainCode(placeOrder(ctx, mobile, order(lines, { paymentMode: "BANK" })))).toBe("PAYMENT_MODE");
    await prisma.customer.update({ where: { clientId_mobile: { clientId: ctx.client.id, mobile } }, data: { isBlocked: true } });
    expect(await domainCode(placeOrder(ctx, mobile, order(lines)))).toBe("CUSTOMER_BLOCKED");
    await prisma.customer.update({ where: { clientId_mobile: { clientId: ctx.client.id, mobile } }, data: { isBlocked: false } });
    expect(await domainCode(placeOrder({ ...ctx, link: { ...ctx.link, allowOrdering: false } }, mobile, order(lines)))).toBe("ORDERING_OFF");
  });

  it("lets the customer cancel while PLACED and gives the stock back, once", async () => {
    const before = await qtyOf(ids.gown!);
    await cancelOrderByCustomer(ctx.client.id, mobile, 1001, "Ordered by mistake");
    expect(await qtyOf(ids.gown!)).toBe(before + 1);
    const o = await getCustomerOrder(ctx.client.id, mobile, 1001);
    expect(o).toMatchObject({ status: "CANCELLED", cancelledBy: "customer", rejectReason: "Ordered by mistake" });
    expect(o?.history.map((h) => h.toStatus)).toEqual(["PLACED", "CANCELLED"]);
    expect(await domainCode(cancelOrderByCustomer(ctx.client.id, mobile, 1001))).toBe("CANNOT_CANCEL");
    expect(await domainCode(cancelOrderByCustomer(ctx.client.id, "9800000000", 1002))).toBe("ORDER_NOT_FOUND"); // someone else's order

    await prisma.order.update({ where: { clientId_orderNo: { clientId: ctx.client.id, orderNo: 1002 } }, data: { status: "CONFIRMED" } });
    expect(await domainCode(cancelOrderByCustomer(ctx.client.id, mobile, 1002))).toBe("CANNOT_CANCEL");
  });

  it("orders on a price-hidden link still record prices for the seller", async () => {
    const link = await createLink(ctx.client.id, linkCreateSchema.parse({ name: "No price", slug: `noprice-${run}`, selectionType: "ALL", allowOrdering: "on", isActive: "on" }));
    const hiddenCtx = (await resolveCatalogLink(link.slug))!;
    const o = await placeOrder(hiddenCtx, mobile, order([{ productId: ids.saree, colour: "Red", qty: 2, price: null }]));
    expect(Number(o.subtotal)).toBe(1700);
  });
});

describe("place order without OTP (Postgres)", () => {
  it("needs only name and mobile, defaults payment to the seller's first option, and never overwrites a saved customer", async () => {
    const c = await makeClient("NoOtp");
    const ctx = (await resolveCatalogLink(c.slug))!;
    const p = await product(c.id, "NO-1", { moq: 1 });
    const minimal = checkoutSchema.parse({ name: "Ravi", mobile: "9844400000", lines: [{ productId: p.id, qty: 1, price: 850 }] });
    expect(minimal).not.toHaveProperty("deliveryAddress", expect.anything());
    const first = await placeOrderWith(ctx, minimal);
    expect(first).toMatchObject({ paymentMode: "PAY_LATER", deliveryAddress: "", city: null, customerName: "Ravi" });

    // Someone orders again with the same (unverified) number and different details.
    const second = await placeOrderWith(ctx, checkoutSchema.parse({ name: "Not Ravi", mobile: "9844400000", gst: "24AAACR5055K1Z5", lines: [{ productId: p.id, qty: 1, price: 850 }] }));
    expect(second.customerName).toBe("Not Ravi"); // the order keeps what was typed
    const customer = await prisma.customer.findUniqueOrThrow({ where: { clientId_mobile: { clientId: c.id, mobile: "9844400000" } } });
    expect(customer).toMatchObject({ name: "Ravi", gst: "24AAACR5055K1Z5" }); // name kept, empty GST filled
  });
});

describe("plan order limit (Postgres)", () => {
  it("stops ordering once this month's orders reach the plan limit", async () => {
    const c = await makeClient("Limit", 2);
    const ctx = (await resolveCatalogLink(c.slug))!;
    const p = await product(c.id, "LIM", { moq: 1 });
    const one = () => placeOrder(ctx, "9833333333", order([{ productId: p.id, qty: 1, price: 850 }]));
    await one();
    await one();
    expect(await domainCode(one())).toBe("ORDER_LIMIT");
  });
});

describe("link discounts (Postgres)", () => {
  let c: Awaited<ReturnType<typeof makeClient>>;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    c = await makeClient("Pricing");
    ids.saree = (await product(c.id, "PR-1", { price: 1000 })).id;
    ids.kurti = (await product(c.id, "PR-2", { price: 40, category: "Kurti" })).id;
  });

  const makeLink = (name: string, pricing: object, extra: object = {}) =>
    createLink(c.id, linkCreateSchema.parse({ name, selectionType: "ALL", selectionValues: [], showPrice: "on", allowOrdering: "on", isActive: "on", pricing: JSON.stringify(pricing), ...extra }));

  it("10% off everything: the shop, the cart and the order all use the link price; the order keeps the sheet price", async () => {
    const link = await makeLink("Ten off", { mode: "ALL", discount: { kind: "PERCENT", value: 10 } });
    const ctx = (await resolveCatalogLink(link.slug))!;
    const cart = await validateCart(ctx, [{ productId: ids.saree!, qty: 2, price: 900 }]);
    expect(cart.lines[0]).toMatchObject({ unitPrice: 900, listPrice: 1000, lineTotal: 1800, issues: [] });

    const placed = await placeOrder(ctx, "9811111111", order([{ productId: ids.saree!, qty: 2, price: 900 }]));
    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: placed.id } });
    expect(Number(item.unitPrice)).toBe(900);
    expect(Number(item.listPrice)).toBe(1000);
    expect(Number(placed.subtotal)).toBe(1800);
  });

  it("a cart that saw the sheet price is told the price changed", async () => {
    const link = await makeLink("Ten off again", { mode: "ALL", discount: { kind: "PERCENT", value: 10 } });
    const ctx = (await resolveCatalogLink(link.slug))!;
    const cart = await validateCart(ctx, [{ productId: ids.saree!, qty: 2, price: 1000 }]);
    expect(cart.lines[0]!.issues).toContain("price_changed");
  });

  it("selected products only: the others keep the sheet price and have no list price", async () => {
    const link = await makeLink("Group", { mode: "GROUP", discount: { kind: "AMOUNT", value: 100 }, productIds: [ids.saree] });
    const ctx = (await resolveCatalogLink(link.slug))!;
    const cart = await validateCart(ctx, [
      { productId: ids.saree!, qty: 2 },
      { productId: ids.kurti!, qty: 2 },
    ]);
    expect(cart.lines.map((l) => [l.unitPrice, l.listPrice])).toEqual([
      [900, 1000],
      [40, null],
    ]);
  });

  it("refuses a ₹ discount that would make a product free, and drops discounts for unknown products", async () => {
    expect(await domainCode(makeLink("Too big", { mode: "ALL", discount: { kind: "AMOUNT", value: 50 } }))).toBe("DISCOUNT_TOO_BIG");
    const link = await makeLink("Each", { mode: "EACH", discounts: { [ids.saree!]: { kind: "PERCENT", value: 5 }, not_a_product: { kind: "PERCENT", value: 5 } } });
    const stored = await prisma.catalogLink.findUniqueOrThrow({ where: { id: link.id } });
    expect(Object.keys((stored.pricing as { discounts: object }).discounts)).toEqual([ids.saree]);
  });

  it("the default link always uses sheet prices", async () => {
    const ctx = (await resolveCatalogLink(c.slug))!;
    const cart = await validateCart(ctx, [{ productId: ids.saree!, qty: 2 }]);
    expect(cart.lines[0]).toMatchObject({ unitPrice: 1000, listPrice: null });
  });
});
