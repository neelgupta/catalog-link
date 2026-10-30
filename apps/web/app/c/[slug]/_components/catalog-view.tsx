import { Search, SlidersHorizontal, X } from "lucide-react";
import {
  CATALOG_SORTS,
  catalogFacets,
  catalogFilterParams,
  type CatalogContext,
  type CatalogFilters,
  filterCatalog,
  pageCatalog,
} from "@cataloglink/core/catalog";
import Link from "next/link";
import { SHOW_CATALOGS } from "@/lib/features";
import { BackLink } from "@/components/ui";
import { getCatalogSnapshot } from "@/lib/catalog";
import { LiveForm } from "@/components/live-form";
import { CatalogGrid } from "./catalog-grid";
import { CatalogFooter, CatalogHeader } from "./catalog-header";
import { DeviceOrdersBanner } from "./device-orders";
import { publicBaseUrl } from "@/lib/public-url";

const inputClass =
  "h-11 w-full min-w-0 rounded-xl border border-stone-300 bg-white px-3 text-base outline-none focus:border-brand-500";

/** A row of tap-to-pick options (radio buttons styled as chips). */
function ChoiceChips({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value?: string;
  options: { value: string; label: string }[];
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className="cursor-pointer rounded-full border border-stone-300 bg-white px-3.5 py-2 text-sm has-checked:border-brand-500 has-checked:bg-brand-50 has-checked:font-medium has-checked:text-brand-700"
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              defaultChecked={(value ?? "") === o.value}
              className="sr-only"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
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
  /** Filters set in the sheet (search, category and catalog have their own controls). */
  const moreCount = active.filter(([k]) => !["q", "category", "catalog"].includes(k)).length;
  const chips = active.filter(([k]) => k !== "category");
  const url = `${await publicBaseUrl()}${base}`;

  const categoryHref = (category?: string) => {
    const params = catalogFilterParams({ ...f, category }, catalog ? ["catalog"] : []).toString();
    return params ? `${base}?${params}` : base;
  };
  // The most common colours only, so the list stays short (search still finds any colour).
  const topColours = [...facets.colours]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((c) => c.name);
  if (f.colour && !topColours.some((c) => c.toLowerCase() === f.colour!.toLowerCase()))
    topColours.push(f.colour);
  const sortOptions = Object.entries(CATALOG_SORTS)
    .filter(([k]) => showPrice || !k.startsWith("price"))
    .map(([k, label]) => ({ value: k === "default" ? "" : k, label }));

  return (
    <div className="min-h-dvh bg-stone-50">
      <CatalogHeader ctx={ctx} url={url} compact={!!catalog} />

      <main className="mx-auto max-w-6xl px-4 pt-4 pb-6">
        {!catalog && <DeviceOrdersBanner slug={ctx.link.slug} />}
        {catalog ? (
          <div className="mb-4">
            <BackLink href={`/c/${ctx.link.slug}`} label="All products" />
            <h1 className="mt-3 text-xl font-semibold">{catalog}</h1>
            <p className="text-sm text-stone-500">{all.length} designs</p>
          </div>
        ) : (
          // Catalogs strip: hidden for now (lib/features.ts).
          SHOW_CATALOGS &&
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

        {/* Search box + one "Filters" button. The filters open as a bottom sheet and apply on "Show". */}
        <LiveForm action={base} live="search" className="mb-3">
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-stone-400" />
              <input
                name="q"
                type="search"
                enterKeyHint="search"
                defaultValue={f.q}
                autoComplete="off"
                placeholder="Search sarees, kurtis…"
                aria-label="Search"
                className={`${inputClass} rounded-full pl-11`}
              />
            </div>
            <label
              htmlFor="filters-toggle"
              className="relative flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full bg-white px-4 text-sm font-medium ring-1 ring-stone-300 hover:bg-stone-50"
            >
              <SlidersHorizontal aria-hidden="true" className="size-4" />
              Filters
              {moreCount > 0 && (
                <span className="flex size-5 items-center justify-center rounded-full bg-brand-500 text-[11px] font-semibold text-white">
                  {moreCount}
                </span>
              )}
            </label>
          </div>

          {f.category && <input type="hidden" name="category" value={f.category} />}
          <input id="filters-toggle" type="checkbox" data-close-on-submit className="peer sr-only" />
          <label
            htmlFor="filters-toggle"
            aria-hidden="true"
            className="fixed inset-0 z-40 hidden bg-black/40 peer-checked:block"
          />
          <div
            role="dialog"
            aria-label="Filters"
            className="fixed inset-x-0 bottom-0 z-50 hidden max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl peer-checked:block sm:inset-x-auto sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Filters</h2>
              <label
                htmlFor="filters-toggle"
                className="cursor-pointer rounded-full px-2 text-2xl leading-none text-stone-500"
                aria-label="Close filters"
              >
                <X aria-hidden="true" className="size-6" />
              </label>
            </div>
            <div className="space-y-5">
              <ChoiceChips
                name="sort"
                label="Sort by"
                value={f.sort === "default" ? "" : f.sort}
                options={sortOptions}
              />
              {facets.colours.length > 1 && (
                <ChoiceChips
                  name="colour"
                  label="Colour"
                  value={f.colour ?? ""}
                  options={[
                    { value: "", label: "Any" },
                    ...topColours.map((c) => ({ value: c, label: c })),
                  ]}
                />
              )}
              {showPrice && facets.price && (
                <fieldset>
                  <legend className="mb-2 text-sm font-semibold">Price (₹)</legend>
                  <div className="flex items-center gap-2">
                    <input
                      name="min"
                      type="number"
                      min={0}
                      inputMode="numeric"
                      defaultValue={f.min}
                      placeholder={`Min ${Math.floor(facets.price.min)}`}
                      aria-label="Minimum price"
                      className={inputClass}
                    />
                    <span className="text-stone-400">–</span>
                    <input
                      name="max"
                      type="number"
                      min={0}
                      inputMode="numeric"
                      defaultValue={f.max}
                      placeholder={`Max ${Math.ceil(facets.price.max)}`}
                      aria-label="Maximum price"
                      className={inputClass}
                    />
                  </div>
                </fieldset>
              )}
              <div className="space-y-3 text-sm">
                {facets.newCount > 0 && (
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      name="new"
                      value="1"
                      defaultChecked={f.newOnly}
                      className="size-5 accent-brand-500"
                    />
                    New arrivals only
                  </label>
                )}
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    name="stock"
                    value="1"
                    defaultChecked={f.inStock}
                    className="size-5 accent-brand-500"
                  />
                  In stock only
                </label>
              </div>
            </div>
            <div className="sticky -bottom-5 -mx-5 mt-6 flex gap-3 bg-white px-5 pt-3 pb-1">
              <Link
                href={f.category ? `${base}?category=${encodeURIComponent(f.category)}` : base}
                className="flex h-12 flex-1 items-center justify-center rounded-full text-sm font-semibold ring-1 ring-stone-300"
              >
                Clear
              </Link>
              <button className="h-12 flex-[2] rounded-full bg-brand-500 text-sm font-semibold text-white hover:bg-brand-600">
                Show designs
              </button>
            </div>
          </div>
        </LiveForm>

        {facets.categories.length > 1 && (
          <nav
            aria-label="Categories"
            className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4"
          >
            {[
              { name: "", label: "All" },
              ...facets.categories.map((c) => ({ name: c.name, label: c.name })),
            ].map((c) => {
              const on = (f.category ?? "").toLowerCase() === c.name.toLowerCase();
              return (
                <Link
                  key={c.name || "all"}
                  href={categoryHref(c.name || undefined)}
                  aria-current={on ? "true" : undefined}
                  className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${on ? "bg-stone-900 text-white" : "bg-white text-stone-700 ring-1 ring-stone-300"}`}
                >
                  {c.label}
                </Link>
              );
            })}
          </nav>
        )}

        {chips.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            {chips.map(([field, label]) => (
              <Link
                key={field}
                href={without(field)}
                aria-label={`Remove filter: ${label}`}
                className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 ring-1 ring-stone-300 hover:bg-stone-100"
              >
                {label} <X aria-hidden="true" className="size-3.5" />
              </Link>
            ))}
            <Link href={base} className="px-1 text-stone-500 underline">
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
