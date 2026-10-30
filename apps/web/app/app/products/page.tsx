import { getClientSettings } from "@cataloglink/core/profile";
import { productFacets } from "@cataloglink/core/products";
import { forClient, type Prisma } from "@cataloglink/db";
import type { Metadata } from "next";
import Link from "next/link";
import { ProductThumb } from "@/components/product-thumb";
import { buttonClass, EmptyState, LinkButton, PageHeader, SearchField } from "@/components/ui";
import { requireClient } from "@/lib/auth";
import { formatDateTime, formatPrice } from "@/lib/format";
import { LiveForm } from "@/components/live-form";
import { FilterSelect } from "./filter-select";
import { HideToggle } from "./hide-toggle";
import { isOnLinks, priceUnit } from "./product-status";

export const metadata: Metadata = { title: "Products" };

const PAGE_SIZE = 24;
const STOCK = { all: "Any stock", in: "In stock", low: "Low stock", out: "Out of stock" } as const;
const SHOW = { all: "All products", visible: "On links", hidden: "Hidden by you", inactive: "Active = No in sheet" } as const;
type Stock = keyof typeof STOCK;
type Show = keyof typeof SHOW;

const pick = <T extends string>(value: string | undefined, options: Record<T, string>, fallback: T): T =>
  value && value in options ? (value as T) : fallback;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; catalog?: string; stock?: string; show?: string; page?: string }>;
}) {
  const { clientId } = await requireClient();
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const category = sp.category ?? "";
  const catalog = sp.catalog ?? "";
  const stock = pick<Stock>(sp.stock, STOCK, "all");
  const show = pick<Show>(sp.show, SHOW, "all");
  const page = Math.max(1, Number(sp.page) || 1);

  const db = forClient(clientId);
  const [settings, facets] = await Promise.all([getClientSettings(clientId), productFacets(clientId)]);
  const low = settings.lowStockThreshold;
  const inSheet = { removedFromSheetAt: null } satisfies Prisma.ProductWhereInput;
  const onLinksWhere: Prisma.ProductWhereInput = {
    ...inSheet,
    sheetActive: true,
    hiddenByClient: false,
    ...(settings.outOfStockMode === "hide" && { availableQty: { gt: 0 } }),
  };

  const where: Prisma.ProductWhereInput = {
    ...inSheet,
    ...(q && { OR: [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }, { fabric: { contains: q, mode: "insensitive" } }] }),
    ...(category && { category }),
    ...(catalog && { catalogName: catalog }),
    ...(stock === "in" && { availableQty: { gt: 0 } }),
    ...(stock === "low" && { availableQty: { gt: 0, lte: Math.max(low, 0) } }),
    ...(stock === "out" && { availableQty: { lte: 0 } }),
    ...(show === "visible" && { sheetActive: true, hiddenByClient: false }),
    ...(show === "hidden" && { hiddenByClient: true }),
    ...(show === "inactive" && { sheetActive: false }),
  };

  const [total, all, onLinks, lowCount, outCount, hiddenCount, inactiveCount, products, conn] = await Promise.all([
    db.product.count({ where }),
    db.product.count({ where: inSheet }),
    db.product.count({ where: onLinksWhere }),
    low > 0 ? db.product.count({ where: { ...inSheet, availableQty: { gt: 0, lte: low } } }) : 0,
    db.product.count({ where: { ...inSheet, availableQty: { lte: 0 } } }),
    db.product.count({ where: { ...inSheet, hiddenByClient: true } }),
    db.product.count({ where: { ...inSheet, sheetActive: false } }),
    db.product.findMany({
      where,
      orderBy: [{ sheetRow: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { images: { orderBy: { position: "asc" }, take: 1, select: { thumbUrl: true, blurDataUrl: true } } },
    }),
    db.sheetConnection.findFirst({ select: { spreadsheetId: true, lastSyncedAt: true } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = Boolean(q || category || catalog || stock !== "all" || show !== "all");

  const href = (patch: Record<string, string | number | undefined>) => {
    const params = { q, category, catalog, stock: stock === "all" ? "" : stock, show: show === "all" ? "" : show, page: "", ...patch };
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && !(k === "page" && Number(v) <= 1)) s.set(k, String(v));
    return `/app/products${s.size ? `?${s}` : ""}`;
  };

  // Status chips set either the stock or the visibility filter (search, category and catalog stay).
  const chips: { label: string; count: number; stock: Stock; show: Show }[] = [
    { label: "All", count: all, stock: "all", show: "all" },
    { label: "On links", count: onLinks, stock: "all", show: "visible" },
    ...(low > 0 ? [{ label: "Low stock", count: lowCount as number, stock: "low" as Stock, show: "all" as Show }] : []),
    { label: "Out of stock", count: outCount, stock: "out", show: "all" },
    { label: "Hidden by you", count: hiddenCount, stock: "all", show: "hidden" },
    { label: "Active = No", count: inactiveCount, stock: "all", show: "inactive" },
  ];

  if (all === 0) {
    return (
      <>
        <PageHeader title="Products" />
        <EmptyState>
          {conn?.spreadsheetId ? "No products yet. Your sheet is syncing, or has no valid rows." : "Your products come from your Google Sheet."}{" "}
          <Link className="text-brand-600 underline" href="/app/sheet">
            {conn?.spreadsheetId ? "View sync status" : "Connect your sheet"}
          </Link>
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Products"
        subtitle={
          <>
            {all} product{all === 1 ? "" : "s"} from your Google Sheet
            {conn?.lastSyncedAt && <span className="text-stone-400"> · synced {formatDateTime(conn.lastSyncedAt)}</span>}
          </>
        }
        action={
          <LinkButton href="/app/sheet" variant="secondary">
            Sync status
          </LinkButton>
        }
      />

      <LiveForm action="/app/products" className="mb-4 rounded-2xl border border-stone-200 bg-white p-3 sm:p-4">
        {/* Keep the status chip's filter when searching or picking a category. */}
        {stock !== "all" && <input type="hidden" name="stock" value={stock} />}
        {show !== "all" && <input type="hidden" name="show" value={show} />}
        <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
          <SearchField defaultValue={q} placeholder="Search name, SKU, fabric…" aria-label="Search products" />
          <div className="grid grid-cols-2 gap-2 md:contents">
            <FilterSelect name="category" value={category} label="Category" allLabel="All categories" options={facets.categories.map((c) => [c.name, `${c.name} (${c.count})`])} />
            <FilterSelect name="catalog" value={catalog} label="Catalog" allLabel="All catalogs" options={facets.catalogs.map((c) => [c.name, `${c.name} (${c.count})`])} />
          </div>
        </div>
        <nav aria-label="Product status" className="no-scrollbar -mx-1 mt-3 flex gap-2 overflow-x-auto px-1">
          {chips.map((c) => {
            const active = c.stock === stock && c.show === show;
            return (
              <Link
                key={c.label}
                href={href({ stock: c.stock === "all" ? "" : c.stock, show: c.show === "all" ? "" : c.show })}
                aria-current={active ? "true" : undefined}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm whitespace-nowrap transition ${
                  active ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-700 hover:bg-stone-200"
                }`}
              >
                {c.label}
                <span className={`text-xs tabular-nums ${active ? "text-white/70" : "text-stone-500"}`}>{c.count}</span>
              </Link>
            );
          })}
        </nav>
      </LiveForm>

      <div className="mb-3 flex items-center justify-between text-sm text-stone-500">
        <span>{filtered ? `${total} of ${all} products` : `${all} products`}</span>
        {filtered && (
          <Link href="/app/products" className="underline hover:text-stone-800">
            Clear filters
          </Link>
        )}
      </div>

      {products.length === 0 ? (
        <EmptyState>No products match these filters.</EmptyState>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4 xl:gap-5">
          {products.map((p) => {
            const visible = isOnLinks(p, settings);
            const out = p.availableQty <= 0;
            const isLow = !out && low > 0 && p.availableQty <= low;
            const reason = !p.sheetActive ? "Active = No in sheet" : p.hiddenByClient ? "Hidden by you" : out && settings.outOfStockMode === "hide" ? "Hidden: out of stock" : null;
            return (
              <li key={p.id} className="group flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white transition hover:border-stone-300 hover:shadow-sm">
                <Link href={`/app/products/${p.id}`} className="relative block">
                  <ProductThumb image={p.images[0]} alt={p.name} className={`aspect-[3/4] w-full transition ${visible ? "" : "opacity-40 grayscale"}`} />
                  <div className="absolute inset-x-2 top-2 flex flex-wrap gap-1">
                    {out && !reason && <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white">Out of stock</span>}
                    {isLow && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white">Only {p.availableQty} left</span>}
                  </div>
                  {reason && (
                    <span className="absolute inset-x-2 bottom-2 rounded-lg bg-stone-900/80 px-2 py-1 text-center text-xs font-medium text-white">
                      Not on links · {reason}
                    </span>
                  )}
                </Link>
                <div className="flex flex-1 flex-col p-3">
                  <Link href={`/app/products/${p.id}`} className="line-clamp-2 text-sm leading-snug font-semibold text-stone-900 hover:underline">
                    {p.name}
                  </Link>
                  <p className="mt-0.5 truncate text-xs text-stone-500">
                    {p.sku} · {p.category}
                    {p.catalogName ? ` · ${p.catalogName}` : ""}
                  </p>
                  <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5">
                    <span className="text-base font-semibold">{formatPrice(p.price)}</span>
                    <span className="text-xs text-stone-500">{priceUnit(p.priceType)}</span>
                    {p.mrp && Number(p.mrp) > Number(p.price) && <span className="text-xs text-stone-400 line-through">{formatPrice(p.mrp)}</span>}
                  </p>
                  <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                    <span className="flex min-w-0 items-center gap-1.5 text-xs text-stone-600">
                      <span className={`size-2 shrink-0 rounded-full ${out ? "bg-red-500" : isLow ? "bg-amber-500" : "bg-green-500"}`} aria-hidden="true" />
                      <span className="truncate">{out ? "Out of stock" : `${p.availableQty} in stock`}</span>
                    </span>
                    {p.sheetActive && <HideToggle productId={p.id} hidden={p.hiddenByClient} compact />}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 && (
        <div className="mt-6 flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link className={buttonClass("secondary")} href={href({ page: page - 1 })}>
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-stone-500">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link className={buttonClass("secondary")} href={href({ page: page + 1 })}>
              Next
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </>
  );
}
