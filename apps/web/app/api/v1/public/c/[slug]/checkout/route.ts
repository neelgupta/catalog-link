import { getEnv } from "@cataloglink/core/env";
import { DomainError } from "@cataloglink/core/errors";
import { CheckoutConflict, hidePrices, placeOrder, signPoToken } from "@cataloglink/core/orders";
import { enqueueOrderSheetWrite } from "@cataloglink/core/orders-sheet";
import { rateLimit } from "@cataloglink/core/ratelimit";
import { checkoutSchema } from "@cataloglink/validation";
import { NextResponse } from "next/server";
import { apiError, crossSiteBlocked, readJson, tooManyRequests, validationError } from "@/lib/api";
import { getCatalogContext } from "@/lib/catalog";
import { revalidateClientCatalog } from "@/lib/catalog-cache";
import { clientIp } from "@/lib/request";

/** Without OTP verification (for now), limit how many orders one connection can place. */
const ORDERS_PER_IP = { limit: 15, windowSec: 60 * 60 };

/**
 * "Place Order": places the order in one transaction (see core/orders/checkout.ts). The customer gives
 * name and mobile (not verified for now). Returns the order number and a private link to its PO slip.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const blocked = crossSiteBlocked(request);
  if (blocked) return blocked;
  const ctx = await getCatalogContext((await params).slug);
  if (!ctx) return apiError(404, "CATALOG_NOT_AVAILABLE", "This catalog link is not active");
  const parsed = checkoutSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const limited = await rateLimit(`order:ip:${await clientIp()}`, ORDERS_PER_IP.limit, ORDERS_PER_IP.windowSec);
  if (!limited.ok) return tooManyRequests(limited.retryAfterSec);

  let order;
  try {
    order = await placeOrder(ctx, parsed.data);
  } catch (err) {
    if (err instanceof CheckoutConflict) {
      const cart = { lines: err.lines, totals: { subtotal: 0, gstTotal: 0, grandTotal: 0, itemCount: 0 } };
      return apiError(409, "CART_CHANGED", "Some items in your cart changed. Please review your cart.", {
        lines: (ctx.link.showPrice ? cart : hidePrices(cart)).lines,
      });
    }
    if (err instanceof DomainError) return apiError(err.code === "PAYMENT_MODE" ? 422 : 403, err.code, err.message);
    throw err;
  }

  // After commit: stock changed on the catalog; the Orders tab is written by the worker (if switched on).
  revalidateClientCatalog(ctx.client.id);
  await enqueueOrderSheetWrite(ctx.client.id, order.id).catch((e) => console.error("[orders-sheet] enqueue failed", e));
  const token = await signPoToken(order.id, ctx.client.id, getEnv().SESSION_SECRET);
  return NextResponse.json({ ok: true, orderNo: order.orderNo, poUrl: `/c/${ctx.link.slug}/po/${token}` }, { status: 201 });
}
