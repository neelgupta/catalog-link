// Pricing and checking a cart against current products. Pure: the caller loads (and, at checkout,
// locks) the products. All money maths uses Decimal; results are plain numbers for JSON.
import { Prisma } from "@cataloglink/db";

export const FULL_SET = "Full set";

export type LineIssue =
  | "removed" // no longer on this link
  | "out_of_stock"
  | "qty_reduced" // less stock than asked for
  | "below_moq"
  | "price_changed"
  | "variant_required" // colour/size must be chosen
  | "variant_invalid"; // the chosen colour/size no longer exists

export const LINE_ISSUE_TEXT: Record<LineIssue, string> = {
  removed: "No longer available",
  out_of_stock: "Out of stock",
  qty_reduced: "Less stock left. Quantity reduced",
  below_moq: "Below the minimum order. Quantity raised",
  price_changed: "Price has changed",
  variant_required: "Choose a colour / size",
  variant_invalid: "This colour / size is no longer available",
};

export type CartLine = { productId: string; colour?: string; size?: string; qty: number; price?: number | null };

/** The product fields pricing needs (a Prisma Product row fits). */
export type CartProduct = {
  id: string;
  sku: string;
  name: string;
  priceType: "PIECE" | "SET";
  /** The price on the link (after any link discount). */
  price: Prisma.Decimal;
  /** The sheet price when the link lowers it, else null/undefined. */
  listPrice?: Prisma.Decimal | null;
  gstPct: Prisma.Decimal | null;
  moq: number;
  availableQty: number;
  colours: string[];
  sizes: string[];
  piecesPerSet: number | null;
  imageUrl: string | null;
};

export type PricedLine = {
  key: string;
  productId: string;
  sku: string;
  name: string;
  imageUrl: string | null;
  colour?: string;
  size?: string;
  priceType: "PIECE" | "SET";
  piecesPerSet: number | null;
  moq: number;
  availableQty: number;
  colours: string[];
  sizes: string[];
  /** What the customer asked for. */
  requestedQty: number;
  /** What can be ordered now (0 when the line can't be ordered). */
  qty: number;
  unitPrice: number;
  /** The sheet price when the link lowers it (shown crossed out), else null. */
  listPrice: number | null;
  gstPct: number | null;
  lineTotal: number;
  gstAmount: number;
  issues: LineIssue[];
};

export type CartTotals = { subtotal: number; gstTotal: number; grandTotal: number; itemCount: number };

const D = (v: Prisma.Decimal | number | string) => new Prisma.Decimal(v);
const round2 = (d: Prisma.Decimal) => d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
const pick = (options: string[], value: string | undefined) => options.find((o) => o.toLowerCase() === value?.trim().toLowerCase());

export const lineKey = (l: { productId: string; colour?: string; size?: string }) => `${l.productId}|${l.colour ?? ""}|${l.size ?? ""}`;

/** Canonical colour/size for a product (case fixed), or the variant problem. */
export function resolveVariant(p: Pick<CartProduct, "priceType" | "colours" | "sizes">, colour?: string, size?: string) {
  const colourOptions = p.priceType === "SET" && p.colours.length > 1 ? [FULL_SET, ...p.colours] : p.colours;
  const out: { colour?: string; size?: string; issue?: "variant_required" | "variant_invalid" } = {};
  if (colourOptions.length === 1) out.colour = colourOptions[0];
  else if (colourOptions.length > 1) {
    out.colour = pick(colourOptions, colour);
    if (!out.colour) out.issue = colour ? "variant_invalid" : "variant_required";
  }
  if (p.priceType === "PIECE" && p.sizes.length === 1) out.size = p.sizes[0];
  else if (p.priceType === "PIECE" && p.sizes.length > 1) {
    out.size = pick(p.sizes, size);
    if (!out.size) out.issue ??= size ? "variant_invalid" : "variant_required";
  }
  return out;
}

/**
 * Checks every line against the products (which must already be limited to what this link shows).
 * Lines with the same product and variant are merged. Stock is shared between lines of one product,
 * in cart order. `qty` is what can be ordered; any issue means checkout must stop and show it.
 */
export function priceCart(products: CartProduct[], lines: CartLine[], opts: { comparePrices: boolean }) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const merged = new Map<string, CartLine & { key: string }>();
  for (const line of lines) {
    const p = byId.get(line.productId);
    const v = p ? resolveVariant(p, line.colour, line.size) : {};
    // Fix the case of valid choices; keep invalid ones as given so they're reported as invalid.
    const normalized = { ...line, colour: v.colour ?? line.colour, size: v.size ?? line.size };
    const key = lineKey(normalized);
    const existing = merged.get(key);
    if (existing) existing.qty += line.qty;
    else merged.set(key, { ...normalized, key });
  }

  const stockLeft = new Map(products.map((p) => [p.id, Math.max(0, p.availableQty)]));
  const priced: PricedLine[] = [];
  for (const line of merged.values()) {
    const p = byId.get(line.productId);
    if (!p) {
      priced.push({
        key: line.key, productId: line.productId, sku: "", name: "", imageUrl: null, colour: line.colour, size: line.size,
        priceType: "PIECE", piecesPerSet: null, moq: 1, availableQty: 0, colours: [], sizes: [],
        requestedQty: line.qty, qty: 0, unitPrice: 0, listPrice: null, gstPct: null, lineTotal: 0, gstAmount: 0, issues: ["removed"],
      });
      continue;
    }
    const issues: LineIssue[] = [];
    const variant = resolveVariant(p, line.colour, line.size);
    if (variant.issue) issues.push(variant.issue);

    const left = stockLeft.get(p.id)!;
    const moq = Math.max(1, p.moq);
    let qty = line.qty;
    if (qty < moq) {
      issues.push("below_moq");
      qty = moq;
    }
    if (left <= 0 || left < moq) {
      issues.push("out_of_stock");
      qty = 0;
    } else if (qty > left) {
      issues.push("qty_reduced");
      qty = left;
    }
    stockLeft.set(p.id, left - qty);

    const unitPrice = D(p.price);
    if (opts.comparePrices && line.price !== undefined && line.price !== null && !unitPrice.equals(D(line.price))) issues.push("price_changed");

    const lineTotal = round2(unitPrice.times(qty));
    const gstAmount = p.gstPct ? round2(lineTotal.times(p.gstPct).dividedBy(100)) : D(0);
    priced.push({
      key: line.key, productId: p.id, sku: p.sku, name: p.name, imageUrl: p.imageUrl, colour: line.colour, size: line.size,
      priceType: p.priceType, piecesPerSet: p.piecesPerSet, moq, availableQty: Math.max(0, p.availableQty), colours: p.colours, sizes: p.sizes,
      requestedQty: line.qty, qty, unitPrice: unitPrice.toNumber(), listPrice: p.listPrice ? p.listPrice.toNumber() : null, gstPct: p.gstPct ? p.gstPct.toNumber() : null,
      lineTotal: lineTotal.toNumber(), gstAmount: gstAmount.toNumber(), issues,
    });
  }

  const ok = priced.filter((l) => l.qty > 0);
  const subtotal = ok.reduce((s, l) => s.plus(l.lineTotal), D(0));
  const gstTotal = ok.reduce((s, l) => s.plus(l.gstAmount), D(0));
  const totals: CartTotals = {
    subtotal: subtotal.toNumber(),
    gstTotal: gstTotal.toNumber(),
    grandTotal: subtotal.plus(gstTotal).toNumber(),
    itemCount: ok.reduce((n, l) => n + l.qty, 0),
  };
  return { lines: priced, totals, hasIssues: priced.some((l) => l.issues.length > 0) };
}

/** Removes prices from a priced cart for links that hide them (the server still knows them). */
export function hidePrices<T extends { lines: PricedLine[]; totals: CartTotals }>(cart: T) {
  return {
    ...cart,
    lines: cart.lines.map((l) => ({ ...l, unitPrice: null, listPrice: null, lineTotal: null, gstAmount: null })),
    totals: { subtotal: null, gstTotal: null, grandTotal: null, itemCount: cart.totals.itemCount },
  };
}
