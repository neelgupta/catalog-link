import { productFacets } from "@cataloglink/core/products";
import { forClient, prisma } from "@cataloglink/db";
import type { PickerProduct } from "./link-form";
import { publicBaseUrl } from "@/lib/public-url";

/** Everything the link form needs to pick products. */
export async function linkFormData(clientId: string) {
  const [client, facets, products] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { slug: true } }),
    productFacets(clientId),
    forClient(clientId).product.findMany({
      where: { removedFromSheetAt: null },
      orderBy: { sheetRow: "asc" },
      select: {
        id: true,
        name: true,
        sku: true,
        category: true,
        catalogName: true,
        sheetActive: true,
        hiddenByClient: true,
        images: { orderBy: { position: "asc" }, take: 1, select: { thumbUrl: true, blurDataUrl: true } },
      },
    }),
  ]);
  return {
    appUrl: await publicBaseUrl(),
    clientSlug: client.slug,
    categories: facets.categories,
    catalogs: facets.catalogs,
    products: products.map(
      (p): PickerProduct => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        category: p.category,
        catalogName: p.catalogName,
        visible: p.sheetActive && !p.hiddenByClient,
        image: p.images[0] ?? null,
      }),
    ),
  };
}
