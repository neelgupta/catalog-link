import { Prisma, prisma } from "@cataloglink/db";
import type { CheckoutInput } from "@cataloglink/validation";
import { istPeriodStarts } from "../admin-stats";
import type { CatalogContext } from "../catalog";
import { DomainError } from "../errors";
import { linkProductWhere, VISIBLE_PRODUCT } from "../links";
import { getCurrentSubscription } from "../subscriptions";
import { priceOnLink } from "../link-pricing";
import { type CartLine, type CartProduct, type PricedLine, priceCart } from "./cart";

type Tx = Prisma.TransactionClient;

/** The cart changed since the customer saw it (stock, price, MOQ, removed products). */
export class CheckoutConflict extends Error {
  constructor(readonly lines: PricedLine[]) {
    super("Some items in your cart changed");
  }
}

/** Products of this link that the given ids refer to, in the shape pricing needs. */
async function linkProducts(db: Tx, ctx: CatalogContext, ids: string[]): Promise<CartProduct[]> {
  const rows = await db.product.findMany({
    where: {
      clientId: ctx.client.id,
      id: { in: ids },
      ...VISIBLE_PRODUCT,
      ...linkProductWhere({ selectionType: ctx.link.selectionType, selectionValues: ctx.link.selectionValues }),
    },
    include: { images: { where: { status: "READY" }, orderBy: { position: "asc" }, take: 1, select: { thumbUrl: true } } },
  });
  // Prices are the link's prices: a custom link may lower them (core/link-pricing.ts).
  return rows.map((p) => {
    const onLink = priceOnLink(ctx.link.pricing, p.id, Number(p.price));
    return {
      ...p,
      price: onLink.listPrice === null ? p.price : new Prisma.Decimal(onLink.price),
      listPrice: onLink.listPrice === null ? null : p.price,
      imageUrl: p.images[0]?.thumbUrl ?? null,
    };
  });
}

const productIds = (lines: { productId: string }[]) => [...new Set(lines.map((l) => l.productId))];

/** Current prices and stock for a cart (the cart page calls this whenever it opens). */
export async function validateCart(ctx: CatalogContext, lines: CartLine[]) {
  const products = await linkProducts(prisma, ctx, productIds(lines));
  return priceCart(products, lines, { comparePrices: ctx.link.showPrice });
}

const ORDERING_UNAVAILABLE = "Ordering is not available on this catalog right now. Please contact the seller on WhatsApp.";

function isRetryable(err: unknown) {
  // P2034: write conflict or deadlock; 40P01/40001 from the driver adapter.
  return (
    (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") ||
    /40P01|40001|deadlock/i.test((err as Error)?.message ?? "")
  );
}

/**
 * Places an order in one transaction (docs/IMPLEMENTATION.md §11): checks the link and customer,
 * the plan's monthly order limit, locks the products, re-checks stock / MOQ / price, holds the stock,
 * and writes the customer, order, items and history. Throws CheckoutConflict with the changed lines.
 */
export async function placeOrder(ctx: CatalogContext, input: CheckoutInput, now = new Date()) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await placeOrderOnce(ctx, input, now);
    } catch (err) {
      if (attempt < 3 && isRetryable(err)) continue;
      throw err;
    }
  }
}

async function placeOrderOnce(ctx: CatalogContext, input: CheckoutInput, now: Date) {
  const clientId = ctx.client.id;
  const mobile = input.mobile;
  return prisma.$transaction(
    async (tx) => {
      if (!ctx.link.allowOrdering) throw new DomainError("ORDERING_OFF", ORDERING_UNAVAILABLE);

      const client = await tx.client.findUniqueOrThrow({ where: { id: clientId }, select: { paymentModes: true } });
      const paymentMode = input.paymentMode ?? client.paymentModes[0] ?? "PAY_LATER";
      if (input.paymentMode && !client.paymentModes.includes(input.paymentMode)) {
        throw new DomainError("PAYMENT_MODE", "Choose one of the payment options shown", "paymentMode");
      }

      const existing = await tx.customer.findUnique({ where: { clientId_mobile: { clientId, mobile } } });
      if (existing?.isBlocked) {
        throw new DomainError("CUSTOMER_BLOCKED", "Ordering isn't available for your number. Please contact the seller.");
      }

      // The counter row lock serialises this client's checkouts: order numbers and the monthly limit
      // are then exact, and product locks below are always taken one checkout at a time.
      const counter = await tx.$queryRaw<{ nextOrderNo: number }[]>`
        SELECT "nextOrderNo" FROM "ClientCounter" WHERE "clientId" = ${clientId} FOR UPDATE`;
      if (!counter[0]) throw new DomainError("ORDERING_OFF", ORDERING_UNAVAILABLE);

      const subscription = await getCurrentSubscription(clientId, tx);
      const monthOrders = await tx.order.count({ where: { clientId, createdAt: { gte: istPeriodStarts(now).month } } });
      if (!subscription || monthOrders >= subscription.plan.maxOrdersPerMonth) {
        throw new DomainError("ORDER_LIMIT", ORDERING_UNAVAILABLE);
      }

      const ids = productIds(input.lines);
      await tx.$queryRaw`SELECT id FROM "Product" WHERE "clientId" = ${clientId} AND id = ANY(${ids}) ORDER BY id FOR UPDATE`;
      const products = await linkProducts(tx, ctx, ids);
      const cart = priceCart(products, input.lines, { comparePrices: ctx.link.showPrice });
      if (cart.hasIssues) throw new CheckoutConflict(cart.lines);

      // Hold the stock locally; the next sync takes the sheet's value again.
      const perProduct = new Map<string, number>();
      for (const l of cart.lines) perProduct.set(l.productId, (perProduct.get(l.productId) ?? 0) + l.qty);
      for (const [id, qty] of perProduct) await tx.product.update({ where: { id }, data: { availableQty: { decrement: qty } } });

      // The mobile isn't verified (no OTP for now), so an order only fills in a known customer's
      // missing details and never overwrites what's saved. The order keeps its own copy.
      const details = {
        shopName: input.shopName ?? null,
        city: input.city ?? null,
        address: input.deliveryAddress ?? null,
        gst: input.gst ?? null,
      };
      const customer = existing
        ? await tx.customer.update({
            where: { id: existing.id },
            data: Object.fromEntries(Object.entries(details).filter(([k, v]) => v && !existing[k as keyof typeof details])),
          })
        : await tx.customer.create({ data: { clientId, mobile, source: "ORDER", name: input.name, ...details } });

      const orderNo = counter[0].nextOrderNo;
      await tx.clientCounter.update({ where: { clientId }, data: { nextOrderNo: { increment: 1 } } });

      return tx.order.create({
        data: {
          clientId,
          orderNo,
          linkId: ctx.link.id,
          customerId: customer.id,
          status: "PLACED",
          paymentMode,
          subtotal: cart.totals.subtotal,
          gstTotal: cart.totals.gstTotal,
          grandTotal: cart.totals.grandTotal,
          customerName: input.name,
          shopName: input.shopName ?? null,
          mobile,
          city: input.city ?? null,
          deliveryAddress: input.deliveryAddress ?? "",
          gst: input.gst ?? null,
          transportPref: input.transportPref ?? null,
          notes: input.notes ?? null,
          items: {
            create: cart.lines.map((l) => ({
              clientId,
              productId: l.productId,
              sku: l.sku,
              name: l.name,
              imageUrl: l.imageUrl,
              colour: l.colour ?? null,
              size: l.size ?? null,
              priceType: l.priceType,
              unitPrice: l.unitPrice,
              listPrice: l.listPrice,
              gstPct: l.gstPct,
              qty: l.qty,
              lineTotal: l.lineTotal,
            })),
          },
          history: { create: { clientId, fromStatus: null, toStatus: "PLACED", byCustomer: true } },
        },
      });
    },
    { timeout: 15_000, maxWait: 10_000 },
  );
}
