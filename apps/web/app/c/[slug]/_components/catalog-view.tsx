import {
  CATALOG_SORTS,
  catalogFacets,
  catalogFilterParams,
  type CatalogContext,
  type CatalogFilters,
  type Facet,
  filterCatalog,
  pageCatalog,
} from "@cataloglink/core/catalog";
import Link from "next/link";
import { getCatalogSnapshot } from "@/lib/catalog";
import { AutoSubmitForm } from "./auto-submit-form";
import { CatalogGrid } from "./catalog-grid";
import { CatalogFooter, CatalogHeader } from "./catalog-header";
import { publicBaseUrl } from "@/lib/public-url";

const selectClass =
  "h-10 w-full min-w-0 rounded-lg border border-stone-300 bg-white px-2 text-base outline-none focus:border-brand-500 sm:text-sm";

function FacetSelect({
  name,
  label,
  value,
  facets,
}: {
  name: string;
  label: string;
  value?: string;
  facets: Facet[];
}) {
  if (facets.length < 2 && !value) return null;
  return (
    <select name={name} defaultValue={value ?? ""} aria-label={label} className={selectClass}>
      <option value="">{label}: all</option>
      {facets.map((f) => (
        <option key={f.name} value={f.name}>
          {f.name} ({f.count})
        </option>
      ))}
    </select>
  );
}

/**
 * Catalog page body: header, catalogs strip, search + filters, product grid. Used by the link home
 * (`/c/[slug]`) and the catalog view (`/c/[slug]/catalog/[name]`, where `catalog` is fixed).
 */
export async function CatalogView({
  ctx,
  filters,
  catalog,
}: {
  ctx: CatalogContext;
  filters: CatalogFilters;
  catalog?: string;
}) {
  const snapshot = await getCatalogSnapshot(ctx);
  const all = catalog
    ? snapshot.items.filter((p) => p.catalogName?.toLowerCase() === catalog.toLowerCase())
    : snapshot.items;
  const facets = catalogFacets(all);
  const f: CatalogFilters = { ...filters, catalog: catalog ?? filters.catalog };
  const results = filterCatalog(all, f);
  const page = pageCatalog(results);
  const showPrice = ctx.link.showPrice;

  const base = catalog
    ? `/c/${ctx.link.slug}/catalog/${encodeURIComponent(catalog)}`
    : `/c/${ctx.link.slug}`;
  const query = catalogFilterParams(f).toString();
  const without = (field: keyof CatalogFilters) => {
    const s = catalogFilterParams(f, catalog ? [field, "catalog"] : [field]).toString();
    return s ? `${base}?${s}` : base;
  };
  const active: [keyof CatalogFilters, string][] = [
    ...(f.q ? [["q", `“${f.q}”`] as [keyof CatalogFilters, string]] : []),
    ...(f.category ? [["category", f.category] as [keyof CatalogFilters, string]] : []),
    ...(!catalog && f.catalog ? [["catalog", f.catalog] as [keyof CatalogFilters, string]] : []),
    ...(f.fabric ? [["fabric", f.fabric] as [keyof CatalogFilters, string]] : []),
    ...(f.colour ? [["colour", f.colour] as [keyof CatalogFilters, string]] : []),
    ...(f.min !== undefined ? [["min", `From ₹${f.min}`] as [keyof CatalogFilters, string]] : []),
    ...(f.max !== undefined ? [["max", `Up to ₹${f.max}`] as [keyof CatalogFilters, string]] : []),
    ...(f.newOnly ? [["newOnly", "New arrivals"] as [keyof CatalogFilters, string]] : []),
    ...(f.inStock ? [["inStock", "In stock"] as [keyof CatalogFilters, string]] : []),
  ];
  const moreCount = active.filter(([k]) => k !== "q").length;
  const url = `${await publicBaseUrl()}${base}`;

  const extraFilters = (
    <>
      <FacetSelect name="category" label="Category" value={f.category} facets={facets.categories} />
      {!catalog && (
        <FacetSelect name="catalog" label="Catalog" value={f.catalog} facets={facets.catalogs} />
      )}
      <FacetSelect name="fabric" label="Fabric" value={f.fabric} facets={facets.fabrics} />
      <FacetSelect name="colour" label="Colour" value={f.colour} facets={facets.colours} />
      {showPrice && facets.price && (
        <div className="flex items-center gap-2">
          <input
            name="min"
            type="number"
            min={0}
            inputMode="numeric"
            defaultValue={f.min}
            placeholder={`Min ₹${Math.floor(facets.price.min)}`}
            aria-label="Minimum price"
            className={selectClass}
          />
          <span className="text-stone-400">–</span>
          <input
            name="max"
            type="number"
            min={0}
            inputMode="numeric"
            defaultValue={f.max}
            placeholder={`Max ₹${Math.ceil(facets.price.max)}`}
            aria-label="Maximum price"
            className={selectClass}
          />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        {facets.newCount > 0 && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="new"
              value="1"
              defaultChecked={f.newOnly}
              className="size-4 accent-brand-500"
            />
            New arrivals ({facets.newCount})
          </label>
        )}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="stock"
            value="1"
            defaultChecked={f.inStock}
            className="size-4 accent-brand-500"
          />
          In stock only
        </label>
      </div>
    </>
  );

  return (
    <div className="min-h-dvh bg-stone-50">
      <CatalogHeader ctx={ctx} url={url} compact={!!catalog} />

      <main className="mx-auto max-w-6xl px-4 pt-4 pb-6">
        {catalog ? (
          <div className="mb-4">
            <Link
              href={`/c/${ctx.link.slug}`}
              className="text-sm text-stone-500 hover:text-stone-800"
            >
              ← All products
            </Link>
            <h1 className="mt-1 text-xl font-semibold">{catalog}</h1>
            <p className="text-sm text-stone-500">{all.length} designs</p>
          </div>
        ) : (
          facets.catalogs.length > 1 &&
          active.length === 0 && (
            <section className="mb-5" aria-label="Catalogs">
              <h2 className="mb-2 text-sm font-semibold text-stone-700">Catalogs</h2>
              <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
                {facets.catalogs.map((c) => (
                  <li key={c.name} className="w-32 shrink-0 snap-start sm:w-40">
                    <Link
                      href={`/c/${ctx.link.slug}/catalog/${encodeURIComponent(c.name)}`}
                      className="block overflow-hidden rounded-xl bg-white ring-1 ring-stone-200 hover:ring-stone-300"
                    >
                      <div
                        className="aspect-[4/3] bg-stone-100 bg-cover bg-center"
                        style={
                          c.cover?.blurDataUrl
                            ? { backgroundImage: `url(${c.cover.blurDataUrl})` }
                            : undefined
                        }
                      >
                        {c.cover && (
                          // eslint-disable-next-line @next/next/no-img-element -- pre-sized thumbnail
                          <img
                            src={c.cover.thumbUrl}
                            alt=""
                            loading="lazy"
                            className="size-full object-cover"
                          />
                        )}
                      </div>
                      <div className="p-2">
                        <p className="truncate text-sm font-medium">{c.name}</p>
                        <p className="text-xs text-stone-500">{c.count} designs</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )
        )}

        <AutoSubmitForm action={base} className="mb-4 space-y-3">
          <div className="flex gap-2">
            <input
              name="q"
              type="search"
              defaultValue={f.q}
              placeholder="Search designs, fabric, colour…"
              aria-label="Search"
              className="h-10 min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-3 text-base outline-none focus:border-brand-500 sm:text-sm"
            />
            <button className="h-10 shrink-0 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600">
              Search
            </button>
          </div>
          {/* One set of fields: a toggle shows them on phones, they're always visible from md up. */}
          <input
            id="filters-toggle"
            type="checkbox"
            className="peer sr-only"
            defaultChecked={moreCount > 0}
          />
          <div className="flex items-center gap-2">
            <label
              htmlFor="filters-toggle"
              className="flex h-10 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-lg bg-white text-sm font-medium ring-1 ring-stone-300 md:hidden"
            >
              Filters{moreCount > 0 ? ` (${moreCount})` : ""}
            </label>
            <select
              name="sort"
              defaultValue={f.sort === "default" ? "" : f.sort}
              aria-label="Sort"
              className={`${selectClass} w-auto flex-1 md:max-w-56 md:flex-none`}
            >
              {Object.entries(CATALOG_SORTS)
                .filter(([k]) => showPrice || !k.startsWith("price"))
                .map(([k, label]) => (
                  <option key={k} value={k === "default" ? "" : k}>
                    {label}
                  </option>
                ))}
            </select>
          </div>
          <div className="hidden grid-cols-1 items-center gap-2 rounded-xl bg-white p-3 ring-1 ring-stone-200 peer-checked:grid md:grid md:grid-cols-2 md:bg-transparent md:p-0 md:ring-0 lg:grid-cols-4">
            {extraFilters}
            <button className="h-10 rounded-lg bg-stone-900 text-sm font-medium text-white md:hidden">
              Apply
            </button>
          </div>
        </AutoSubmitForm>

        {active.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
            {active.map(([field, label]) => (
              <Link
                key={field}
                href={without(field)}
                aria-label={`Remove filter: ${label}`}
                className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 ring-1 ring-stone-300 hover:bg-stone-100"
              >
                {label} <span aria-hidden="true">×</span>
              </Link>
            ))}
            <Link href={base} className="text-stone-500 underline">
              Clear all
            </Link>
          </div>
        )}

        <p className="mb-3 text-sm text-stone-500">
          {results.length === all.length
            ? `${all.length} designs`
            : `${results.length} of ${all.length} designs`}
        </p>

        {results.length === 0 ? (
          <div className="rounded-xl bg-white px-4 py-10 text-center text-sm text-stone-500 ring-1 ring-stone-200">
            {all.length === 0
              ? "No products here yet. Please check back soon."
              : "No designs match. Try removing a filter."}
          </div>
        ) : (
          <CatalogGrid
            key={query}
            slug={ctx.link.slug}
            initial={page.items}
            nextCursor={page.nextCursor}
            query={query}
            lowStockThreshold={snapshot.lowStockThreshold}
          />
        )}
      </main>

      <CatalogFooter ctx={ctx} />
    </div>
  );
}
