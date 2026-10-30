import { type CatalogContext, loadCatalogProduct, loadCatalogSnapshot, resolveCatalogLink } from "@cataloglink/core/catalog";
import { unstable_cache } from "next/cache";
import { cache } from "react";

/** Catalog data is cached per link; syncs, dashboard edits (and orders, later) invalidate these tags. */
const tags = (ctx: CatalogContext) => [`catalog:${ctx.client.id}`, `link:${ctx.link.id}`];
const FALLBACK_SECONDS = 300;

/**
 * Resolved on every request (not cached), so deactivating a client or an expiring plan takes effect
 * immediately. React's cache() shares it between generateMetadata and the page.
 */
export const getCatalogContext = cache((slug: string) => resolveCatalogLink(slug));

export const getCatalogSnapshot = cache((ctx: CatalogContext) =>
  unstable_cache(loadCatalogSnapshot, ["catalog-snapshot"], { tags: tags(ctx), revalidate: FALLBACK_SECONDS })(ctx),
);

export const getCatalogProduct = cache((ctx: CatalogContext, sku: string) =>
  unstable_cache(loadCatalogProduct, ["catalog-product"], { tags: tags(ctx), revalidate: FALLBACK_SECONDS })(ctx, sku),
);
