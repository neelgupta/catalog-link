import { forClient } from "@cataloglink/db";
import { DomainError } from "./errors";

/** Hide or show a product on every link without touching the sheet (the sheet's Active column still applies). */
export async function setProductHidden(clientId: string, productId: string, hidden: boolean) {
  const { count } = await forClient(clientId).product.updateMany({ where: { id: productId }, data: { hiddenByClient: hidden } });
  if (count === 0) throw new DomainError("PRODUCT_NOT_FOUND", "Product not found");
}

/** Categories and catalog names in the client's sheet, with product counts, for filters and link pickers. */
export async function productFacets(clientId: string) {
  const db = forClient(clientId);
  const where = { removedFromSheetAt: null };
  const [categories, catalogs] = await Promise.all([
    db.product.groupBy({ by: ["category"], where, _count: { _all: true }, orderBy: { category: "asc" } }),
    db.product.groupBy({ by: ["catalogName"], where: { ...where, catalogName: { not: null } }, _count: { _all: true }, orderBy: { catalogName: "asc" } }),
  ]);
  return {
    categories: categories.map((c) => ({ name: c.category, count: c._count._all })),
    catalogs: catalogs.filter((c) => c.catalogName).map((c) => ({ name: c.catalogName!, count: c._count._all })),
  };
}

/** "New" badge: tagged "New Arrival" in the sheet, or first synced within the last `days` days. */
export function isNewArrival(product: { tags: string[]; firstSeenAt: Date }, days: number, now = new Date()) {
  return (
    product.tags.some((t) => t.trim().toLowerCase() === "new arrival") ||
    product.firstSeenAt.getTime() > now.getTime() - days * 86_400_000
  );
}
