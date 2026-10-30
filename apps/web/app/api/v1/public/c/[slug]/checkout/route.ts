import { DomainError } from "@cataloglink/core/errors";
import { CheckoutConflict, hidePrices, placeOrder } from "@cataloglink/core/orders";
import { enqueueOrderSheetWrite } from "@cataloglink/core/orders-sheet";
import { checkoutSchema } from "@cataloglink/validation";
import { NextResponse } from "next/server";
import { apiError, crossSiteBlocked, readJson, validationError } from "@/lib/api";
import { getCustomerSession } from "@/lib/auth";
import { revalidateClientCatalog } from "@/lib/catalog-cache";
import { getCatalogContext } from "@/lib/catalog";

/** Places the order (one transaction, see core/orders/checkout.ts). Needs the customer's OTP session. */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const blocked = crossSiteBlocked(request);
  if (blocked) return blocked;
  const ctx = await getCatalogContext((await params).slug);
  if (!ctx) return apiError(404, "CATALOG_NOT_AVAILABLE", "This catalog link is not active");
  const session = await getCustomerSession(ctx.client.id);
  if (!session) return apiError(401, "LOGIN_REQUIRED", "Please verify your mobile number first.");
  const parsed = checkoutSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  let order;
  try {
    order = await placeOrder(ctx, session.mobile, parsed.data);
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
  return NextResponse.json({ ok: true, orderNo: order.orderNo }, { status: 201 });
}
