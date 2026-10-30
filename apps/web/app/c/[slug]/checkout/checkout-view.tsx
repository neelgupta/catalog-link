"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { readCart, writeCart } from "../_components/cart-store";
import { CustomerLogin, type SavedCustomer } from "../_components/customer-login";
import { PaymentDetails, type SellerPayment } from "../_components/payment-details";
import { qtyLabel, rupees } from "../_components/price";
import { useCheckedCart } from "../_components/use-cart";

type Mode = "PAY_LATER" | "UPI" | "BANK";
const MODE_LABEL: Record<Mode, string> = { PAY_LATER: "Pay later / credit", UPI: "UPI", BANK: "Bank transfer" };
const inputClass = "w-full rounded-lg border bg-white px-3 text-base outline-none focus:border-brand-500 sm:text-sm";

function Field({ label, name, error, textarea, ...props }: { label: string; name: string; error?: string; textarea?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  const cls = `${inputClass} ${error ? "border-red-400" : "border-stone-300"}`;
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-stone-700">{label}</span>
      {textarea ? (
        <textarea name={name} defaultValue={props.defaultValue as string} placeholder={props.placeholder} required={props.required} rows={3} className={`${cls} py-2`} />
      ) : (
        <input name={name} className={`${cls} h-11`} {...props} />
      )}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

export function CheckoutView({
  slug,
  linkId,
  allowOrdering,
  mobile: sessionMobile,
  saved: savedFromServer,
  paymentModes,
  payment,
  devHint,
}: {
  slug: string;
  linkId: string;
  allowOrdering: boolean;
  mobile: string | null;
  saved: SavedCustomer;
  paymentModes: Mode[];
  payment: SellerPayment;
  devHint: boolean;
}) {
  const router = useRouter();
  const { cart, blocked } = useCheckedCart(slug, linkId);
  const [mobile, setMobile] = useState(sessionMobile);
  const [saved, setSaved] = useState(savedFromServer);
  const [mode, setMode] = useState<Mode>(paymentModes[0] ?? "PAY_LATER");
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

  const placeOrder = async (form: HTMLFormElement) => {
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const data = Object.fromEntries(new FormData(form)) as Record<string, string>;
    const lines = readCart(linkId).map(({ productId, colour, size, qty, price }) => ({ productId, colour, size, qty, price }));
    const res = await fetch(`/api/v1/public/c/${slug}/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...data, paymentMode: mode, lines }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    if (res?.status === 201) {
      writeCart(linkId, []);
      router.push(`/c/${slug}/orders/${body.orderNo}?placed=1`);
      return;
    }
    setBusy(false);
    if (!res) return setError({ message: "No internet connection. Please try again." });
    if (res.status === 401) {
      setMobile(null);
      return setError({ message: "Please verify your mobile number again." });
    }
    if (res.status === 409) return setError({ message: body.error?.message ?? "Your cart changed.", cartChanged: true });
    if (res.status === 422 && Array.isArray(body.error?.details)) {
      setFieldErrors(Object.fromEntries(body.error.details.map((d: { path: string; message: string }) => [d.path, d.message])));
      return setError({ message: "Please fix the highlighted fields." });
    }
    setError({ message: body.error?.message ?? "Could not place the order. Please try again." });
  };

  const { totals } = cart;
  return (
    <div className="space-y-5">
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
                <span className="text-xs text-stone-500">
                  {[l.colour, l.size && `Size ${l.size}`, qtyLabel(l.qty, l.priceType)].filter(Boolean).join(" · ")}
                </span>
              </span>
              {l.lineTotal !== null && <span className="shrink-0">{rupees(l.lineTotal)}</span>}
            </li>
          ))}
        </ul>
        {totals.grandTotal !== null ? (
          <div className="mt-2 space-y-1 border-t border-stone-100 pt-2 text-sm">
            <div className="flex justify-between text-stone-600">
              <span>Subtotal + GST</span>
              <span>
                {rupees(totals.subtotal!)} + {rupees(totals.gstTotal!)}
              </span>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span>
              <span>{rupees(totals.grandTotal)}</span>
            </div>
          </div>
        ) : (
          <p className="mt-2 border-t border-stone-100 pt-2 text-sm text-stone-600">The seller will confirm prices and the total.</p>
        )}
      </section>

      {!mobile ? (
        <section className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
          <CustomerLogin
            slug={slug}
            devHint={devHint}
            title="Verify your mobile number to place the order"
            onVerified={(m, customer) => {
              setMobile(m);
              setSaved(customer);
              setError(null);
            }}
          />
        </section>
      ) : (
        <form
          key={mobile}
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            placeOrder(e.currentTarget);
          }}
        >
          <section className="space-y-4 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
            <div className="flex items-center justify-between text-sm">
              <h2 className="text-base font-semibold">Delivery details</h2>
              <span className="text-stone-500">Mobile: {mobile} ✓</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Your name" name="name" defaultValue={saved?.name ?? ""} required autoComplete="name" error={fieldErrors.name} />
              <Field label="Shop name (optional)" name="shopName" defaultValue={saved?.shopName ?? ""} autoComplete="organization" error={fieldErrors.shopName} />
              <Field label="City" name="city" defaultValue={saved?.city ?? ""} required autoComplete="address-level2" error={fieldErrors.city} />
              <Field label="GST number (optional)" name="gst" defaultValue={saved?.gst ?? ""} className={`${inputClass} h-11 uppercase`} error={fieldErrors.gst} />
            </div>
            <Field label="Delivery address" name="deliveryAddress" textarea defaultValue={saved?.address ?? ""} required error={fieldErrors.deliveryAddress} />
            <Field label="Transport / courier (optional)" name="transportPref" placeholder="e.g. VRL Logistics, Shree Maruti Courier" error={fieldErrors.transportPref} />
            <Field label="Notes for the seller (optional)" name="notes" textarea error={fieldErrors.notes} />
          </section>

          <section className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
            <h2 className="text-base font-semibold">Payment</h2>
            <div className="grid gap-2 sm:grid-cols-3">
              {paymentModes.map((m) => (
                <label key={m} className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm ${mode === m ? "border-brand-500 bg-brand-50 font-medium" : "border-stone-200"}`}>
                  <input type="radio" name="paymentModeChoice" checked={mode === m} onChange={() => setMode(m)} className="size-4 accent-brand-500" />
                  {MODE_LABEL[m]}
                </label>
              ))}
            </div>
            <div className="rounded-xl bg-stone-50 p-3">
              <PaymentDetails mode={mode} payment={payment} />
            </div>
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
          <p className="text-center text-xs text-stone-500">The seller confirms the order and stock before dispatch.</p>
        </form>
      )}
    </div>
  );
}
