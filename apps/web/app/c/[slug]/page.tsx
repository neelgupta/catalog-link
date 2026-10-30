import { parseCatalogFilters } from "@cataloglink/core/catalog";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCatalogContext, getCatalogSnapshot } from "@/lib/catalog";
import { CatalogView } from "./_components/catalog-view";
import { publicBaseUrl } from "@/lib/public-url";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const ctx = await getCatalogContext(slug);
  if (!ctx) return { title: "Catalog not available", robots: { index: false } };
  const { items } = await getCatalogSnapshot(ctx);
  const image = ctx.client.logoUrl ?? items.find((p) => p.image)?.image?.thumbUrl;
  const title = ctx.link.isDefault
    ? ctx.client.businessName
    : `${ctx.link.name} – ${ctx.client.businessName}`;
  const description = `${items.length} designs from ${ctx.client.businessName}, ${ctx.client.city}. Browse and order online.`;
  return {
    title: { absolute: title },
    description,
    robots: { index: false },
    openGraph: {
      title,
      description,
      url: `${await publicBaseUrl()}/c/${slug}`,
      type: "website",
      images: image ? [{ url: `${await publicBaseUrl()}${image}` }] : undefined,
    },
  };
}

/** Public catalog link. */
export default async function CatalogPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const ctx = await getCatalogContext(slug);
  if (!ctx) notFound();
  return <CatalogView ctx={ctx} filters={parseCatalogFilters(await searchParams)} />;
}
