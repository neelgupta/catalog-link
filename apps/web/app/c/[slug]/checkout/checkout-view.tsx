"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { readCart, writeCart } from "../_components/cart-store";
import { qtyLabel, rupees } from "../_components/price";
import { useCheckedCart } from "../_components/use-cart";

type Buyer = { name: string; mobile: string; gst: string };
const BUYER_KEY = "cl_buyer";
const inputClass = "h-11 w-full rounded-lg border bg-white px-3 text-base outline-none focus:border-brand-500 sm:text-sm";

/** Name, mobile and GST from the last order on this phone, so repeat orders are quick. */
function savedBuyer(): Buyer {
  try {
    const v = JSON.parse(localStorage.getItem(BUYER_KEY) ?? "{}");
    return { name: String(v.name ?? ""), mobile: String(v.mobile ?? ""), gst: String(v.gst ?? "") };
  } catch {
    return { name: "", mobile: "", gst: "" };
  }
}

function Field({ label, name, error, defaultValue, ...props }: { label: string; name: keyof Buyer; error?: string; defaultValue: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-stone-700">{label}</span>
      <input name={name} defaultValue={defaultValue} className={`${inputClass} ${error ? "border-red-400" : "border-stone-300"}`} {...props} />
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

export function CheckoutView({ slug, linkId, allowOrdering }: { slug: string; linkId: string; allowOrdering: boolean }) {
  const router = useRouter();
  const { cart, blocked } = useCheckedCart(slug, linkId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; cartChanged?: boolean } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  if (!allowOrdering) return <p className="rounded-xl bg-stone-100 p-4 text-sm">Ordering is switched off on this catalog.</p>;
  if (!cart) return <div className="h-40 animate-pulse rounded-xl bg-white ring-1 ring-stone-200" aria-label="Loading" />;
  if (!cart.lines.length) {
    return (
      <p className="rounded-xl bg-white p-6 text-center text-sm ring-1 ring-stone-200">
        Your cart is empty.{" "}
        <Link href={`/c/${slug}`} className="text-brand-700 underline">
          Browse the catalog
        </Link>
      </p>
    );
  }
  if (blocked) {
    return (
      <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
        Some items in your cart are no longer available.{" "}
        <Link href={`/c/${slug}/cart`} className="underline">
          Review your cart
        </Link>
      </p>
    );
  }

  const buyer = savedBuyer();
  const place = async (form: HTMLFormElement) => {
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const data = Object.fromEntries(new FormData(form)) as Buyer;
    const lines = readCart(linkId).map(({ productId, colour, size, qty, price }) => ({ productId, colour, size, qty, price }));
    const res = await fetch(`/api/v1/public/c/${slug}/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...data, lines }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    if (res?.status === 201) {
      try {
        localStorage.setItem(BUYER_KEY, JSON.stringify(data));
      } catch {
        /* not remembered */
      }
      writeCart(linkId, []);
      router.push(`${body.poUrl}?placed=1`);
      return;
    }
    setBusy(false);
    if (!res) return setError({ message: "No internet connection. Please try again." });
    if (res.status === 409) return setError({ message: body.error?.message ?? "Your cart changed.", cartChanged: true });
    if (res.status === 422 && Array.isArray(body.error?.details)) {
      setFieldErrors(Object.fromEntries(body.error.details.map((d: { path: string; message: string }) => [d.path, d.message])));
      return setError({ message: "Please fix the highlighted fields." });
    }
    if (res.status === 429) return setError({ message: "Too many orders from this connection. Please try again later." });
    setError({ message: body.error?.message ?? "Could not place the order. Please try again." });
  };

  const { totals } = cart;
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        place(e.currentTarget);
      }}
    >
      <section className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold">Order summary</h2>
          <Link href={`/c/${slug}/cart`} className="text-sm text-brand-700 underline">
            Edit cart
          </Link>
        </div>
        <ul className="divide-y divide-stone-100 text-sm">
          {cart.lines.map((l) => (
            <li key={l.key} className="flex justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block truncate">{l.name}</span>
                <span className="text-xs text-stone-500">{[l.colour, l.size && `Size ${l.size}`, qtyLabel(l.qty, l.priceType)].filter(Boolean).join(" · ")}</span>
              </span>
              {l.lineTotal !== null && <span className="shrink-0">{rupees(l.lineTotal)}</span>}
            </li>
          ))}
        </ul>
        {totals.grandTotal !== null ? (
          <div className="mt-2 flex justify-between border-t border-stone-100 pt-2 text-base font-semibold">
            <span>Total (incl. GST)</span>
            <span>{rupees(totals.grandTotal)}</span>
          </div>
        ) : (
          <p className="mt-2 border-t border-stone-100 pt-2 text-sm text-stone-600">The seller will confirm prices and the total.</p>
        )}
      </section>

      <section className="space-y-4 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
        <h2 className="text-base font-semibold">Your details</h2>
        <Field label="Your name" name="name" defaultValue={buyer.name} required autoComplete="name" error={fieldErrors.name} />
        <Field label="Mobile number" name="mobile" defaultValue={buyer.mobile} required type="tel" inputMode="numeric" autoComplete="tel" placeholder="98765 43210" error={fieldErrors.mobile} />
        <Field label="GST number (optional)" name="gst" defaultValue={buyer.gst} className={`${inputClass} border-stone-300 uppercase`} error={fieldErrors.gst} />
      </section>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error.message}{" "}
          {error.cartChanged && (
            <Link href={`/c/${slug}/cart`} className="font-medium underline">
              Review your cart
            </Link>
          )}
        </p>
      )}
      <button disabled={busy} className="h-12 w-full rounded-full bg-brand-500 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
        {busy ? "Placing order…" : "Place order"}
      </button>
      <p className="text-center text-xs text-stone-500">You&apos;ll get a Purchase Order (PO) slip right away. The seller confirms the order and stock.</p>
    </form>
  );
}
