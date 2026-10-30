// Link-only discounts (docs/IMPLEMENTATION.md §10): a custom link can lower prices for all of its
// products, for a chosen group, or product by product. Discounts only: never above the sheet price.
// Pure functions (no database), shared by the shop, the cart, checkout and the link form preview.
import { type Discount, type LinkPricing, linkPricingSchema } from "@cataloglink/validation";

export type { Discount, LinkPricing };

export const NO_PRICING: LinkPricing = { mode: "NONE" };

/** The stored JSON as pricing; anything unreadable counts as "no discount". */
export function parseLinkPricing(json: unknown): LinkPricing {
  const parsed = linkPricingSchema.safeParse(json);
  return parsed.success ? parsed.data : NO_PRICING;
}

/** The discount that applies to one product on this link, if any. */
export function discountFor(pricing: LinkPricing, productId: string): Discount | null {
  switch (pricing.mode) {
    case "ALL":
      return pricing.discount;
    case "GROUP":
      return pricing.productIds.includes(productId) ? pricing.discount : null;
    case "EACH":
      return pricing.discounts[productId] ?? null;
    default:
      return null;
  }
}

/**
 * The price after a discount, never below ₹0. Worked in paise to avoid rounding drift; a % discount
 * on a whole-rupee price is rounded to whole rupees (₹999 − 12.5% = ₹874, not ₹874.13).
 */
export function applyDiscount(price: number, d: Discount): number {
  const paise = Math.round(price * 100);
  let after: number;
  if (d.kind === "PERCENT") {
    after = (paise * (100 - d.value)) / 100;
    after = paise % 100 === 0 ? Math.round(after / 100) * 100 : Math.round(after);
  } else {
    after = paise - Math.round(d.value * 100);
  }
  return Math.max(0, after) / 100;
}

/** "10% off", "₹50 off" */
export function discountLabel(d: Discount): string {
  if (d.kind === "PERCENT") return `${Number(d.value.toFixed(2))}% off`;
  const rupees = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(d.value);
  return `₹${rupees} off`;
}

export type LinkPrice = {
  /** What the customer pays on this link. */
  price: number;
  /** The sheet price, when the link lowers it (shown crossed out); otherwise null. */
  listPrice: number | null;
  /** e.g. "10% off", when discounted. */
  label: string | null;
};

/** One product's price on a link. */
export function priceOnLink(pricing: LinkPricing, productId: string, sheetPrice: number): LinkPrice {
  const d = discountFor(pricing, productId);
  if (!d) return { price: sheetPrice, listPrice: null, label: null };
  const price = applyDiscount(sheetPrice, d);
  if (price >= sheetPrice) return { price: sheetPrice, listPrice: null, label: null };
  return { price, listPrice: sheetPrice, label: discountLabel(d) };
}

/**
 * Products whose price a discount would wipe out (₹0 or less). Used to refuse such a link, since
 * discounts are meant to lower prices, not give products away.
 */
export function freeProducts(pricing: LinkPricing, products: { id: string; name: string; price: number }[]) {
  return products.filter((p) => {
    const d = discountFor(pricing, p.id);
    return d !== null && p.price > 0 && applyDiscount(p.price, d) <= 0;
  });
}
