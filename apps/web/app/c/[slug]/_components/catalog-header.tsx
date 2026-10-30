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

function PhoneIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
    </svg>
  );
}

/** Seller branding: banner, logo, name, WhatsApp and call buttons. `compact` for inner pages. */
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
      className={`${compact ? "size-9" : "size-14 sm:size-16"} shrink-0 rounded-xl bg-white object-cover ring-1 ring-stone-200`}
    />
  ) : (
    <span
      className={`${compact ? "size-9 text-base" : "size-14 text-2xl sm:size-16"} flex shrink-0 items-center justify-center rounded-xl bg-brand-500 font-semibold text-white`}
    >
      {c.businessName.trim().charAt(0).toUpperCase()}
    </span>
  );
  const buttons = (
    <div className="flex shrink-0 gap-2">
      <a
        href={wa}
        target="_blank"
        rel="noreferrer"
        aria-label="WhatsApp the seller"
        className="inline-flex h-10 items-center gap-2 rounded-full bg-[#1f8f4e] px-3 text-sm font-medium text-white hover:bg-[#187a42] sm:px-4"
      >
        <WhatsAppIcon />
        <span className={compact ? "sr-only sm:not-sr-only" : ""}>WhatsApp</span>
      </a>
      <a
        href={telUrl(c.whatsapp)}
        aria-label="Call the seller"
        className="inline-flex size-10 items-center justify-center rounded-full bg-white text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50"
      >
        <PhoneIcon />
      </a>
      {ctx.link.allowOrdering && <CartButton slug={ctx.link.slug} linkId={ctx.link.id} />}
    </div>
  );

  if (compact) {
    return (
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <Link href={home} className="flex min-w-0 items-center gap-2.5">
            {logo}
            <span className="truncate text-sm font-semibold">{c.businessName}</span>
          </Link>
          {buttons}
        </div>
      </header>
    );
  }

  return (
    <header className="bg-white">
      {c.bannerUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- seller banner
        <img
          src={c.bannerUrl}
          alt=""
          className="aspect-[16/5] max-h-72 w-full object-cover"
          fetchPriority="high"
        />
      )}
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
        <div className="flex min-w-0 items-center gap-3">
          {logo}
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold sm:text-xl">{c.businessName}</h1>
            <p className="truncate text-sm text-stone-500">
              {c.city}
              {!ctx.link.isDefault && ` · ${ctx.link.name}`}
              {" · "}
              <Link href={`${home}/orders`} className="text-brand-700 hover:underline">
                My orders
              </Link>
            </p>
          </div>
        </div>
        {buttons}
      </div>
    </header>
  );
}

export function CatalogFooter({ ctx }: { ctx: CatalogContext }) {
  const c = ctx.client;
  return (
    <footer className="mt-12 border-t border-stone-200 bg-white">
      <div className="mx-auto max-w-6xl space-y-1 px-4 py-6 text-xs text-stone-500">
        <p className="font-medium text-stone-700">{c.businessName}</p>
        {c.address && <p>{c.address}</p>}
        {c.gst && <p>GSTIN: {c.gst}</p>}
        <p className="pt-2">
          <Link href={`/c/${ctx.link.slug}/orders`} className="text-brand-700 hover:underline">
            My orders
          </Link>
        </p>
        <p className="pt-2">Catalog by CatalogLink</p>
      </div>
    </footer>
  );
}
