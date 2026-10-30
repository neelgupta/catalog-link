"use client";

import { Minus, Plus } from "lucide-react";
import Link from "next/link";
import { qtyLabel, rupees, unitLabel } from "../_components/price";
import { BLOCKING, type CheckedLine, ISSUE_TEXT, useCheckedCart } from "../_components/use-cart";

function variantText(l: { colour?: string; size?: string }) {
  return [l.colour, l.size && `Size ${l.size}`].filter(Boolean).join(" · ");
}

function Stepper({ line, onChange }: { line: CheckedLine; onChange: (qty: number) => void }) {
  const min = Math.max(1, line.moq);
  const max = line.availableQty;
  return (
    <div className="inline-flex items-center rounded-full ring-1 ring-stone-300">
      <button
        type="button"
        aria-label={`Decrease quantity of ${line.name}`}
        disabled={line.qty <= min}
        onClick={() => onChange(line.qty - 1)}
        className="flex size-9 items-center justify-center disabled:text-stone-300"
      >
        <Minus aria-hidden="true" className="size-4" />
      </button>
      <span
        aria-label={`Quantity of ${line.name}`}
        className="w-10 text-center text-sm tabular-nums"
      >
        {line.qty}
      </span>
      <button
        type="button"
        aria-label={`Increase quantity of ${line.name}`}
        disabled={line.qty >= max}
        onClick={() => onChange(line.qty + 1)}
        className="flex size-9 items-center justify-center disabled:text-stone-300"
      >
        <Plus aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}

export function CartView({ slug, linkId }: { slug: string; linkId: string }) {
  const { cart, changes, error, blocked, refresh, update } = useCheckedCart(slug, linkId);

  if (error) {
    return (
      <div className="rounded-xl bg-white p-6 text-center text-sm ring-1 ring-stone-200">
        Couldn&apos;t load your cart.{" "}
        <button type="button" onClick={refresh} className="text-brand-700 underline">
          Try again
        </button>
      </div>
    );
  }
  if (!cart)
    return (
      <div
        className="h-40 animate-pulse rounded-xl bg-white ring-1 ring-stone-200"
        aria-label="Loading cart"
      />
    );
  if (!cart.lines.length) {
    return (
      <div className="rounded-xl bg-white px-4 py-10 text-center ring-1 ring-stone-200">
        <p className="text-sm text-stone-600">Your cart is empty.</p>
        <Link
          href={`/c/${slug}`}
          className="mt-4 inline-flex h-11 items-center rounded-full bg-brand-500 px-6 text-sm font-semibold text-white"
        >
          Browse the catalog
        </Link>
      </div>
    );
  }

  const { totals, showPrice } = cart;
  return (
    <div className="space-y-4">
      {changes.length > 0 && (
        <div role="status" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">Some items changed since you added them:</p>
          <ul className="mt-1 list-disc pl-5">
            {changes.map((l) => (
              <li key={l.key}>
                {l.name}:{" "}
                {l.issues
                  .filter((i) => !BLOCKING.includes(i))
                  .map((i) => ISSUE_TEXT[i])
                  .join(" ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
        {cart.lines.map((l) => {
          const problems = l.issues.filter((i) => BLOCKING.includes(i));
          return (
            <li key={l.key} className="flex gap-3 p-3 sm:p-4">
              <Link href={`/c/${slug}/p/${encodeURIComponent(l.sku)}`} className="shrink-0">
                {l.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- thumbnail
                  <img
                    src={l.imageUrl}
                    alt=""
                    className="h-24 w-18 rounded-lg bg-stone-100 object-cover"
                  />
                ) : (
                  <span className="block h-24 w-18 rounded-lg bg-stone-100" />
                )}
              </Link>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/c/${slug}/p/${encodeURIComponent(l.sku)}`}
                    className="line-clamp-2 text-sm font-medium"
                  >
                    {l.name || "Product"}
                  </Link>
                  <button
                    type="button"
                    onClick={() => update(l.productId, l.colour, l.size, null)}
                    className="shrink-0 text-xs text-stone-500 underline"
                  >
                    Remove
                  </button>
                </div>
                <p className="text-xs text-stone-500">{variantText(l) || `Code ${l.sku}`}</p>
                {l.unitPrice !== null && (
                  <p className="text-xs text-stone-600">
                    {l.listPrice !== null && (
                      <span className="mr-1 text-stone-400 line-through">{rupees(l.listPrice)}</span>
                    )}
                    <span className={l.listPrice !== null ? "font-medium text-green-700" : ""}>{rupees(l.unitPrice)}</span> /{" "}
                    {unitLabel(l.priceType)}
                    {l.gstPct ? ` + ${l.gstPct}% GST` : ""}
                  </p>
                )}
                {problems.length > 0 ? (
                  <p className="text-sm font-medium text-red-600">
                    {problems.map((i) => ISSUE_TEXT[i]).join(" ")}
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <Stepper
                      line={l}
                      onChange={(qty) => update(l.productId, l.colour, l.size, qty)}
                    />
                    {l.lineTotal !== null && (
                      <span className="text-sm font-semibold">{rupees(l.lineTotal)}</span>
                    )}
                  </div>
                )}
                {problems.length === 0 && (
                  <p className="text-xs text-stone-400">
                    Min {qtyLabel(l.moq, l.priceType)} · {l.availableQty} in stock
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="space-y-2 rounded-2xl bg-white p-4 text-sm ring-1 ring-stone-200">
        {showPrice && totals.grandTotal !== null ? (
          <>
            <div className="flex justify-between">
              <span className="text-stone-600">Subtotal</span>
              <span>{rupees(totals.subtotal!)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-600">GST</span>
              <span>{rupees(totals.gstTotal!)}</span>
            </div>
            <div className="flex justify-between border-t border-stone-100 pt-2 text-base font-semibold">
              <span>Total</span>
              <span>{rupees(totals.grandTotal)}</span>
            </div>
          </>
        ) : (
          <p className="text-stone-600">
            The seller will share prices and the total when they confirm your order.
          </p>
        )}
        <p className="text-xs text-stone-500">
          Delivery charges, if any, are confirmed by the seller.
        </p>
      </div>

      {!cart.allowOrdering ? (
        <p className="rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-700">
          Ordering is switched off on this catalog. Please contact the seller on WhatsApp.
        </p>
      ) : blocked ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          Remove the items marked in red to continue.
        </p>
      ) : (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            {showPrice && totals.grandTotal !== null && (
              <p className="shrink-0 leading-tight sm:hidden">
                <span className="block text-xs text-stone-500">Total</span>
                <span className="text-lg font-semibold">{rupees(totals.grandTotal)}</span>
              </p>
            )}
            <Link
              href={`/c/${slug}/checkout`}
              className="flex h-12 flex-1 items-center justify-center rounded-full bg-brand-500 text-sm font-semibold text-white hover:bg-brand-600"
            >
              Place Order
            </Link>
          </div>
        </div>
      )}
      <Link href={`/c/${slug}`} className="block py-2 text-center text-sm text-stone-600 underline">
        Add more items
      </Link>
    </div>
  );
}
