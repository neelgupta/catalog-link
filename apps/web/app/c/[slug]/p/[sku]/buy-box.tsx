"use client";

import { Check, Minus, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { addToCart } from "../../_components/cart-store";
import { qtyLabel, rupees, unitLabel } from "../../_components/price";

export type BuyBoxProduct = {
  name: string;
  sku: string;
  price: number | null;
  priceType: "PIECE" | "SET";
  piecesPerSet: number | null;
  moq: number;
  availableQty: number;
  colours: string[];
  sizes: string[];
  gstPct: number | null;
};

const FULL_SET = "Full set";

function Chips({
  label,
  options,
  value,
  onChange,
  error,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  error: boolean;
}) {
  return (
    <fieldset id={`choose-${label.toLowerCase()}`} className="scroll-mt-24">
      <legend className="mb-2 text-sm font-medium">
        {label}:{" "}
        {value ? (
          <span className="font-normal text-stone-600">{value}</span>
        ) : (
          <span className={error ? "font-semibold text-red-600" : "font-normal text-stone-500"}>
            {error ? `Please choose a ${label.toLowerCase()}` : "choose one"}
          </span>
        )}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o}
            className={`cursor-pointer rounded-full border px-4 py-2 text-sm ${value === o ? "border-brand-500 bg-brand-50 font-medium text-brand-700" : error && !value ? "border-red-300 bg-white" : "border-stone-300 bg-white"}`}
          >
            <input
              type="radio"
              name={label}
              value={o}
              checked={value === o}
              onChange={() => onChange(o)}
              className="sr-only"
            />
            {o}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Where "Add to cart" puts the line; null when the link doesn't allow ordering. */
export type CartTarget = {
  linkId: string;
  slug: string;
  productId: string;
  imageUrl: string | null;
} | null;

/**
 * Colour / size / full set choice and a quantity stepper (minimum = MOQ, maximum = stock), then
 * "Add to cart". The same choice can also be sent to the seller on WhatsApp.
 */
export function BuyBox({
  product: p,
  sellerWhatsapp,
  productUrl,
  cart,
}: {
  product: BuyBoxProduct;
  sellerWhatsapp: string;
  productUrl: string;
  cart: CartTarget;
}) {
  const [added, setAdded] = useState(false);
  const [showMissing, setShowMissing] = useState(false);
  const isSet = p.priceType === "SET";
  const colourOptions = isSet && p.colours.length > 1 ? [FULL_SET, ...p.colours] : p.colours;
  const sizeOptions = !isSet && p.sizes.length > 1 ? p.sizes : [];
  const [colour, setColour] = useState(
    colourOptions.length === 1 ? colourOptions[0]! : isSet && p.colours.length > 1 ? FULL_SET : "",
  );
  const [size, setSize] = useState(sizeOptions.length ? "" : (p.sizes[0] ?? ""));
  const min = Math.max(1, p.moq);
  const max = p.availableQty;
  const canBuy = max >= min;
  const [qty, setQty] = useState(min);
  const [draft, setDraft] = useState(String(min));

  const setClamped = (n: number) => {
    const v = Math.min(max, Math.max(min, Number.isFinite(n) ? Math.round(n) : min));
    setQty(v);
    setDraft(String(v));
    setAdded(false);
  };

  const missing = [
    colourOptions.length > 1 && !colour && "colour",
    sizeOptions.length > 0 && !size && "size",
  ].filter(Boolean) as string[];
  const total = p.price !== null ? p.price * qty : null;

  const message = [
    cart ? "Hi, I have a question about:" : "Hi, I'd like to order:",
    `*${p.name}* (${p.sku})`,
    colour && `Colour: ${colour}`,
    size && !isSet && `Size: ${size}`,
    `Qty: ${qtyLabel(qty, p.priceType)}`,
    p.price !== null &&
      `Price: ${rupees(p.price)} / ${unitLabel(p.priceType)}${p.gstPct ? ` + ${p.gstPct}% GST` : ""}`,
    productUrl,
  ]
    .filter(Boolean)
    .join("\n");
  const digits = sellerWhatsapp.replace(/\D/g, "");
  const waUrl = `https://wa.me/${digits.length === 10 ? `91${digits}` : digits}?text=${encodeURIComponent(message)}`;

  return (
    <div className="space-y-5">
      {colourOptions.length > 1 && (
        <Chips
          label="Colour"
          options={colourOptions}
          value={colour}
          onChange={(v) => {
            setColour(v);
            setAdded(false);
          }}
          error={showMissing}
        />
      )}
      {sizeOptions.length > 0 && (
        <Chips
          label="Size"
          options={sizeOptions}
          value={size}
          onChange={(v) => {
            setSize(v);
            setAdded(false);
          }}
          error={showMissing}
        />
      )}
      {isSet && p.sizes.length > 0 && (
        <p className="text-sm text-stone-600">
          Each set has {p.piecesPerSet ? `${p.piecesPerSet} pieces in ` : ""}sizes{" "}
          {p.sizes.join(", ")}.
        </p>
      )}

      {canBuy ? (
        <div>
          <p className="mb-2 text-sm font-medium">Quantity ({isSet ? "sets" : "pieces"})</p>
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center rounded-full ring-1 ring-stone-300">
              <button
                type="button"
                aria-label="Decrease quantity"
                onClick={() => setClamped(qty - 1)}
                disabled={qty <= min}
                className="flex size-11 items-center justify-center rounded-l-full disabled:text-stone-300"
              >
                <Minus aria-hidden="true" className="size-4" />
              </button>
              <input
                aria-label="Quantity"
                inputMode="numeric"
                value={draft}
                onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
                onBlur={() => setClamped(Number(draft))}
                className="h-11 w-14 border-x border-stone-300 text-center text-base outline-none"
              />
              <button
                type="button"
                aria-label="Increase quantity"
                onClick={() => setClamped(qty + 1)}
                disabled={qty >= max}
                className="flex size-11 items-center justify-center rounded-r-full disabled:text-stone-300"
              >
                <Plus aria-hidden="true" className="size-4" />
              </button>
            </div>
            <p className="text-xs text-stone-500">
              Min {qtyLabel(min, p.priceType)}
              <br />
              {max} in stock
            </p>
          </div>
        </div>
      ) : (
        <p className="rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-700">
          {max <= 0
            ? "Out of stock right now."
            : `Only ${qtyLabel(max, p.priceType)} left, less than the minimum order of ${qtyLabel(min, p.priceType)}.`}{" "}
          Ask the seller on WhatsApp when it will be back.
        </p>
      )}

      {/* The main action: a bar stuck to the bottom of the screen on phones, inline on larger screens. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:static md:border-0 md:bg-transparent md:p-0">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          {canBuy && total !== null && (
            <p className="shrink-0 leading-tight">
              <span className="block text-xs text-stone-500">Total</span>
              <span className="text-lg font-semibold">{rupees(total)}</span>
              {p.gstPct ? (
                <span className="block text-[11px] text-stone-500">+ {p.gstPct}% GST</span>
              ) : null}
            </p>
          )}
          {canBuy && cart ? (
            added ? (
              <Link
                href={`/c/${cart.slug}/cart`}
                className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-full bg-stone-900 text-sm font-semibold text-white"
              >
                <Check aria-hidden="true" className="size-4" /> Added · View cart
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (missing.length) {
                    setShowMissing(true);
                    document
                      .getElementById(`choose-${missing[0]}`)
                      ?.scrollIntoView({ behavior: "smooth", block: "center" });
                    return;
                  }
                  addToCart(cart.linkId, {
                    productId: cart.productId,
                    sku: p.sku,
                    name: p.name,
                    imageUrl: cart.imageUrl,
                    colour: colour || undefined,
                    size: !isSet && size ? size : undefined,
                    qty,
                    price: p.price,
                  });
                  setAdded(true);
                }}
                className="h-12 flex-1 rounded-full bg-brand-500 text-sm font-semibold text-white hover:bg-brand-600"
              >
                Add to cart
              </button>
            )
          ) : (
            <a
              href={waUrl}
              target="_blank"
              rel="noreferrer"
              className="flex h-12 flex-1 items-center justify-center rounded-full bg-[#1f8f4e] text-sm font-semibold text-white hover:bg-[#187a42]"
            >
              {canBuy ? "Order on WhatsApp" : "Ask on WhatsApp"}
            </a>
          )}
        </div>
      </div>
      {canBuy && cart && (
        <p className="text-sm text-stone-600">
          Have a question?{" "}
          <a
            href={waUrl}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-[#187a42] underline"
          >
            Ask on WhatsApp
          </a>
        </p>
      )}
    </div>
  );
}
