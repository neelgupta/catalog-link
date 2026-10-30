import { parseCatalogFilters } from "@cataloglink/core/catalog";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCatalogContext, getCatalogSnapshot } from "@/lib/catalog";
import { CatalogView } from "../../_components/catalog-view";
import { publicBaseUrl } from "@/lib/public-url";

type Props = {
  params: Promise<{ slug: string; name: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function load(params: Props["params"]) {
  const { slug, name } = await params;
  const ctx = await getCatalogContext(slug);
  if (!ctx) return null;
  const wanted = decodeURIComponent(name).toLowerCase();
  const items = (await getCatalogSnapshot(ctx)).items.filter(
    (p) => p.catalogName?.toLowerCase() === wanted,
  );
  return items.length ? { ctx, items, catalog: items[0]!.catalogName! } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await load(params);
  if (!data) return { title: "Catalog not available", robots: { index: false } };
  const { ctx, items, catalog } = data;
  const title = `${catalog} – ${ctx.client.businessName}`;
  const image = items.find((p) => p.image)?.image?.thumbUrl;
  return {
    title: { absolute: title },
    description: `${items.length} designs in ${catalog}.`,
    robots: { index: false },
    openGraph: {
      title,
      description: `${items.length} designs in ${catalog}.`,
      images: image ? [{ url: `${await publicBaseUrl()}${image}` }] : undefined,
    },
  };
}

/** All designs of one catalog, e.g. "Rangoli Vol-3". */
export default async function CatalogNamePage({ params, searchParams }: Props) {
  const data = await load(params);
  if (!data) notFound();
  return (
    <CatalogView
      ctx={data.ctx}
      catalog={data.catalog}
      filters={parseCatalogFilters(await searchParams)}
    />
  );
}
