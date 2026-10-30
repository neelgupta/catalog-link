import { hidePrices, validateCart } from "@cataloglink/core/orders";
import { cartSchema } from "@cataloglink/validation";
import { NextResponse } from "next/server";
import { apiError, readJson, validationError } from "@/lib/api";
import { getCatalogContext } from "@/lib/catalog";

/** Current prices, stock and problems for the customer's cart (called whenever the cart opens). */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await getCatalogContext((await params).slug);
  if (!ctx) return apiError(404, "CATALOG_NOT_AVAILABLE", "This catalog link is not active");
  const parsed = cartSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);
  const cart = await validateCart(ctx, parsed.data.lines);
  return NextResponse.json(
    { ...(ctx.link.showPrice ? cart : hidePrices(cart)), showPrice: ctx.link.showPrice, allowOrdering: ctx.link.allowOrdering },
    { headers: { "cache-control": "no-store" } },
  );
}
