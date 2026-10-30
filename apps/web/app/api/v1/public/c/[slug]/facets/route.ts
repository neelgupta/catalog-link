import { catalogFacets } from "@cataloglink/core/catalog";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getCatalogContext, getCatalogSnapshot } from "@/lib/catalog";

/** Filter options for a catalog link: categories, catalogs, fabrics, colours, price range. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getCatalogContext(slug);
  if (!ctx) return apiError(404, "CATALOG_NOT_AVAILABLE", "This catalog link is not active");
  const { items } = await getCatalogSnapshot(ctx);
  const { catalogs, ...rest } = catalogFacets(items);
  return NextResponse.json(
    { ...rest, catalogs: catalogs.map(({ name, count }) => ({ name, count })), total: items.length },
    { headers: { "cache-control": "no-store" } },
  );
}
