import type { CatalogItem } from "@cataloglink/core/catalog";
import Link from "next/link";
import { qtyLabel, rupees, unitLabel } from "./price";

/** Grid card. Plain component: rendered on the server for the first page and by the grid for more. */
export function ProductCard({
  item: p,
  slug,
  lowStockThreshold,
  priority = false,
}: {
  item: CatalogItem;
  slug: string;
  lowStockThreshold: number;
  priority?: boolean;
}) {
  const out = p.availableQty <= 0;
  const low = !out && lowStockThreshold > 0 && p.availableQty <= lowStockThreshold;
  return (
    <Link
      href={`/c/${slug}/p/${encodeURIComponent(p.sku)}`}
      className="group block overflow-hidden rounded-xl bg-white ring-1 ring-stone-200 transition hover:ring-stone-300"
    >
      <div
        className="relative aspect-[3/4] bg-stone-100 bg-cover bg-center"
        style={
          p.image?.blurDataUrl ? { backgroundImage: `url(${p.image.blurDataUrl})` } : undefined
        }
      >
        {p.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- pre-sized 400px WebP from the image worker
          <img
            src={p.image.thumbUrl}
            alt={p.name}
            width={400}
            height={533}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : undefined}
            decoding="async"
            className={`size-full object-cover transition group-hover:scale-[1.02] ${out ? "opacity-60" : ""}`}
          />
        ) : (
          <span className="flex size-full items-center justify-center text-xs text-stone-400">
            Photo coming soon
          </span>
        )}
        <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
          {p.isNew && (
            <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white">
              New
            </span>
          )}
          {out && (
            <span className="rounded-full bg-stone-900/80 px-2 py-0.5 text-[11px] font-semibold text-white">
              Out of stock
            </span>
          )}
          {low && (
            <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white">
              Only {p.availableQty} left
            </span>
          )}
        </div>
      </div>
      <div className="space-y-0.5 p-2.5 sm:p-3">
        <p className="line-clamp-2 text-sm leading-snug font-medium text-stone-900">{p.name}</p>
        {p.price !== null ? (
          <p className="text-sm">
            <span className="font-semibold">{rupees(p.price)}</span>
            <span className="text-xs text-stone-500"> / {unitLabel(p.priceType)}</span>
            {p.mrp !== null && p.mrp > p.price && (
              <span className="ml-1.5 text-xs text-stone-400 line-through">{rupees(p.mrp)}</span>
            )}
          </p>
        ) : (
          <p className="text-sm font-medium text-brand-700">Price on request</p>
        )}
        <p className="truncate text-xs text-stone-500">
          {p.piecesPerSet ? `Set of ${p.piecesPerSet} · ` : ""}MOQ {qtyLabel(p.moq, p.priceType)}
        </p>
      </div>
    </Link>
  );
}
