import { getClientSettings } from "@cataloglink/core/profile";
import { productFacets } from "@cataloglink/core/products";
import { forClient, type Prisma } from "@cataloglink/db";
import type { Metadata } from "next";
import Link from "next/link";
import { ProductThumb } from "@/components/product-thumb";
import { buttonClass, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { requireClient } from "@/lib/auth";
import { formatRupees } from "@/lib/format";
import { FilterSelect } from "./filter-select";
import { HideToggle } from "./hide-toggle";
import { isOnLinks, priceUnit, ProductBadges } from "./product-status";

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

  const where: Prisma.ProductWhereInput = {
    removedFromSheetAt: null,
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

  const [total, all, products, conn] = await Promise.all([
    db.product.count({ where }),
    db.product.count({ where: { removedFromSheetAt: null } }),
    db.product.findMany({
      where,
      orderBy: [{ sheetRow: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { images: { orderBy: { position: "asc" }, take: 1, select: { thumbUrl: true, blurDataUrl: true } } },
    }),
    db.sheetConnection.findFirst({ select: { spreadsheetId: true } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = Boolean(q || category || catalog || stock !== "all" || show !== "all");

  const href = (patch: Record<string, string | number | undefined>) => {
    const params = { q, category, catalog, stock: stock === "all" ? "" : stock, show: show === "all" ? "" : show, page: "", ...patch };
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && !(k === "page" && Number(v) <= 1)) s.set(k, String(v));
    return `/app/products${s.size ? `?${s}` : ""}`;
  };

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
        subtitle={filtered ? `${total} of ${all} products` : `${all} products from your Google Sheet`}
        action={<LinkButton href="/app/sheet" variant="secondary">Sync status</LinkButton>}
      />

      <form action="/app/products" className="mb-4 space-y-2 rounded-2xl border border-stone-200 bg-white p-3">
        <div className="flex gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search name, SKU, fabric…"
            className="h-10 min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-3 text-base outline-none focus:border-brand-500 sm:text-sm"
          />
          <button className={buttonClass("primary")}>Search</button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <FilterSelect name="category" value={category} label="Category" allLabel="All categories" options={facets.categories.map((c) => [c.name, `${c.name} (${c.count})`])} />
          <FilterSelect name="catalog" value={catalog} label="Catalog" allLabel="All catalogs" options={facets.catalogs.map((c) => [c.name, `${c.name} (${c.count})`])} />
          <FilterSelect
            name="stock"
            value={stock === "all" ? "" : stock}
            label="Stock"
            options={(Object.keys(STOCK) as Stock[]).filter((s) => s !== "all" && (s !== "low" || low > 0)).map((s) => [s, s === "low" ? `Low (≤ ${low})` : STOCK[s]])}
            allLabel={STOCK.all}
          />
          <FilterSelect name="show" value={show === "all" ? "" : show} label="Visibility" options={(Object.keys(SHOW) as Show[]).filter((s) => s !== "all").map((s) => [s, SHOW[s]])} allLabel={SHOW.all} />
        </div>
        {filtered && (
          <Link href="/app/products" className="inline-block text-sm text-stone-500 underline">
            Clear filters
          </Link>
        )}
      </form>

      {products.length === 0 ? (
        <EmptyState>No products match these filters.</EmptyState>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4 2xl:grid-cols-6">
          {products.map((p) => {
            const onLinks = isOnLinks(p, settings);
            return (
              <li key={p.id} className={`flex flex-col overflow-hidden rounded-2xl border bg-white ${onLinks ? "border-stone-200" : "border-dashed border-stone-300"}`}>
                <Link href={`/app/products/${p.id}`} className="block min-w-0 flex-1">
                  <ProductThumb image={p.images[0]} alt={p.name} className={`aspect-[3/4] w-full ${onLinks ? "" : "opacity-50"}`} />
                  <div className="space-y-1 p-3">
                    <p className="line-clamp-2 text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-stone-500">
                      {p.sku} · {p.category}
                    </p>
                    <p className="text-sm font-semibold">
                      {formatRupees(p.price)} <span className="text-xs font-normal text-stone-500">{priceUnit(p.priceType)}</span>
                    </p>
                    <p className="text-xs text-stone-500">Qty {p.availableQty}</p>
                    <ProductBadges product={p} settings={settings} />
                  </div>
                </Link>
                {p.sheetActive && (
                  <div className="px-3 pb-3">
                    <HideToggle productId={p.id} hidden={p.hiddenByClient} compact />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? <Link className={buttonClass("secondary")} href={href({ page: page - 1 })}>Previous</Link> : <span />}
          <span className="text-stone-500">
            Page {page} of {pages}
          </span>
          {page < pages ? <Link className={buttonClass("secondary")} href={href({ page: page + 1 })}>Next</Link> : <span />}
        </div>
      )}
    </>
  );
}
