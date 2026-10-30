import { FileText, MapPin, Phone, ReceiptText } from "lucide-react";
import type { CatalogContext } from "@cataloglink/core/catalog";
import { sellerWhatsappUrl, telUrl } from "@cataloglink/core/catalog";
import Link from "next/link";
import { CartButton } from "./cart-button";

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="currentColor">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.8-1.2.2-.6.2-1.1.1-1.2l-.4-.3Z" />
    </svg>
  );
}

/**
 * One sticky bar on every page: logo + name (taps home), WhatsApp, and the cart. The home page
 * (`compact` false) also shows the seller's banner under it.
 */
export function CatalogHeader({
  ctx,
  url,
  compact = false,
}: {
  ctx: CatalogContext;
  url: string;
  compact?: boolean;
}) {
  const c = ctx.client;
  const wa = sellerWhatsappUrl(
    c.whatsapp,
    `Hi ${c.businessName}, I'm looking at your catalog: ${url}`,
  );
  const home = `/c/${ctx.link.slug}`;
  const logo = c.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- small stored logo
    <img
      src={c.logoUrl}
      alt=""
      className="size-10 shrink-0 rounded-xl bg-white object-cover ring-1 ring-stone-200"
    />
  ) : (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-lg font-semibold text-white">
      {c.businessName.trim().charAt(0).toUpperCase()}
    </span>
  );

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <Link href={home} className="flex min-w-0 items-center gap-3">
            {logo}
            <span className="min-w-0">
              <span className="block truncate text-base leading-tight font-semibold">
                {c.businessName}
              </span>
              <span className="block truncate text-xs text-stone-500">
                {[c.city, !ctx.link.isDefault && ctx.link.name].filter(Boolean).join(" · ")}
              </span>
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={wa}
              target="_blank"
              rel="noreferrer"
              aria-label="WhatsApp the seller"
              className="inline-flex size-11 items-center justify-center gap-2 rounded-full bg-[#1f8f4e] text-white hover:bg-[#187a42] sm:w-auto sm:px-4"
            >
              <WhatsAppIcon />
              <span className="hidden text-sm font-medium sm:inline">WhatsApp</span>
            </a>
            {ctx.link.allowOrdering && <CartButton slug={ctx.link.slug} linkId={ctx.link.id} />}
          </div>
        </div>
      </header>
      {!compact && c.bannerUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- seller banner
        <img
          src={c.bannerUrl}
          alt=""
          className="mx-auto aspect-[16/5] max-h-72 w-full max-w-6xl object-cover"
          fetchPriority="high"
        />
      )}
    </>
  );
}

/** Seller details and the three ways to reach them, on every shop page. */
export function CatalogFooter({ ctx }: { ctx: CatalogContext }) {
  const c = ctx.client;
  const pill =
    "inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition";
  return (
    <footer className="mt-12 border-t border-stone-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex items-center gap-3">
          {c.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- small stored logo
            <img src={c.logoUrl} alt="" className="size-12 shrink-0 rounded-xl bg-white object-cover ring-1 ring-stone-200" />
          ) : (
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-xl font-semibold text-white">
              {c.businessName.trim().charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate font-semibold text-stone-900">{c.businessName}</p>
            {c.city && <p className="truncate text-sm text-stone-500">{c.city}</p>}
          </div>
        </div>

        {(c.address || c.gst) && (
          <ul className="mt-4 space-y-2 text-sm text-stone-600">
            {c.address && (
              <li className="flex gap-2">
                <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-stone-400" />
                {c.address}
              </li>
            )}
            {c.gst && (
              <li className="flex gap-2">
                <FileText aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-stone-400" />
                GSTIN {c.gst}
              </li>
            )}
          </ul>
        )}

        <div className="mt-5 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
          <a
            href={sellerWhatsappUrl(c.whatsapp, `Hi ${c.businessName}, I have a question about your catalog.`)}
            target="_blank"
            rel="noreferrer"
            className={`${pill} bg-[#1f8f4e] text-white hover:bg-[#187a42]`}
          >
            <WhatsAppIcon /> WhatsApp
          </a>
          <div className="grid grid-cols-2 gap-2 sm:contents">
            <a href={telUrl(c.whatsapp)} className={`${pill} bg-white text-stone-800 ring-1 ring-stone-300 hover:bg-stone-50`}>
              <Phone aria-hidden="true" className="size-4" /> Call
            </a>
            <Link
              href={`/c/${ctx.link.slug}/orders`}
              className={`${pill} bg-white text-stone-800 ring-1 ring-stone-300 hover:bg-stone-50`}
            >
              <ReceiptText aria-hidden="true" className="size-4" /> My orders
            </Link>
          </div>
        </div>

        <p className="mt-8 border-t border-stone-100 pt-4 text-center text-xs text-stone-400">
          Catalog by <span className="font-semibold text-stone-500">CatalogLink</span>
        </p>
      </div>
    </footer>
  );
}
