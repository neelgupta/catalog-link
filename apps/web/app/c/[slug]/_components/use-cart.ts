"use client";

import { useCallback, useEffect, useState } from "react";
import { readCart, type StoredLine, writeCart } from "./cart-store";

export type Issue = "removed" | "out_of_stock" | "qty_reduced" | "below_moq" | "price_changed" | "variant_required" | "variant_invalid";

/** A line as the server checked it (prices are null on price-hidden links). */
export type CheckedLine = {
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
  requestedQty: number;
  qty: number;
  unitPrice: number | null;
  gstPct: number | null;
  lineTotal: number | null;
  issues: Issue[];
};
export type CheckedCart = {
  lines: CheckedLine[];
  totals: { subtotal: number | null; gstTotal: number | null; grandTotal: number | null; itemCount: number };
  showPrice: boolean;
  allowOrdering: boolean;
};

export const ISSUE_TEXT: Record<Issue, string> = {
  removed: "No longer available. Please remove it.",
  out_of_stock: "Out of stock. Please remove it.",
  qty_reduced: "Only this much is left, so the quantity was reduced.",
  below_moq: "Raised to the minimum order quantity.",
  price_changed: "The price has changed.",
  variant_required: "Choose a colour / size on the product page.",
  variant_invalid: "This colour / size is no longer available.",
};

/** Problems the customer has to act on (the others are fixed in the cart automatically). */
export const BLOCKING: Issue[] = ["removed", "out_of_stock", "variant_required", "variant_invalid"];

const same = (a?: string, b?: string) => (a ?? "").toLowerCase() === (b ?? "").toLowerCase();

async function check(slug: string, lines: StoredLine[]): Promise<CheckedCart> {
  const res = await fetch(`/api/v1/public/c/${slug}/cart/validate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lines: lines.map(({ productId, colour, size, qty, price }) => ({ productId, colour, size, qty, price })) }),
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

/**
 * The stored cart checked against current prices and stock. Quantity and price changes are written
 * back to the cart, and listed in `changes` so the customer sees what happened.
 */
export function useCheckedCart(slug: string, linkId: string) {
  const [cart, setCart] = useState<CheckedCart | null>(null);
  const [changes, setChanges] = useState<CheckedLine[]>([]);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    setError(false);
    const stored = readCart(linkId);
    if (!stored.length) {
      setCart({ lines: [], totals: { subtotal: 0, gstTotal: 0, grandTotal: 0, itemCount: 0 }, showPrice: true, allowOrdering: true });
      return;
    }
    try {
      let checked = await check(slug, stored);
      const changed = checked.lines.filter((l) => l.issues.some((i) => i === "qty_reduced" || i === "below_moq" || i === "price_changed"));
      if (changed.length) {
        const fixed = stored.map((s) => {
          const c = checked.lines.find((l) => l.productId === s.productId && same(l.colour, s.colour) && same(l.size, s.size));
          return c && c.qty > 0 ? { ...s, qty: c.qty, price: c.unitPrice } : s;
        });
        writeCart(linkId, fixed);
        checked = await check(slug, fixed);
        setChanges(changed);
      }
      setCart(checked);
    } catch {
      setError(true);
    }
  }, [slug, linkId]);

  useEffect(() => {
    // Loading the cart is a side effect of opening the page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const update = (productId: string, colour: string | undefined, size: string | undefined, qty: number | null) => {
    const stored = readCart(linkId);
    const next = stored
      .map((s) => (s.productId === productId && same(s.colour, colour) && same(s.size, size) ? (qty === null ? null : { ...s, qty }) : s))
      .filter((s): s is StoredLine => s !== null);
    writeCart(linkId, next);
    setChanges([]);
    refresh();
  };

  const blocked = !!cart?.lines.some((l) => l.issues.some((i) => BLOCKING.includes(i)));
  return { cart, changes, error, blocked, refresh, update };
}
