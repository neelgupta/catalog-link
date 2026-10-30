import { filterCatalog, pageCatalog, parseCatalogFilters } from "@cataloglink/core/catalog";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getCatalogContext, getCatalogSnapshot } from "@/lib/catalog";

/** Next page of a catalog link's products (infinite scroll), with the same filters as the page URL. */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getCatalogContext(slug);
  if (!ctx) return apiError(404, "CATALOG_NOT_AVAILABLE", "This catalog link is not active");
  const search = new URL(request.url).searchParams;
  const { items } = await getCatalogSnapshot(ctx);
  const page = pageCatalog(filterCatalog(items, parseCatalogFilters(search)), Number(search.get("cursor")) || 0);
  return NextResponse.json(page, { headers: { "cache-control": "no-store" } });
}
