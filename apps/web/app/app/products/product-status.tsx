import { Badge } from "@/components/ui";

export type StockSettings = { outOfStockMode: "badge" | "hide"; lowStockThreshold: number };

type ProductState = { sheetActive: boolean; hiddenByClient: boolean; availableQty: number };

/** True when the product shows on links (before each link's own product selection). */
export function isOnLinks(p: ProductState, settings: StockSettings) {
  return p.sheetActive && !p.hiddenByClient && !(p.availableQty <= 0 && settings.outOfStockMode === "hide");
}

/** Badges explaining how a product appears to customers. */
export function ProductBadges({ product: p, settings }: { product: ProductState; settings: StockSettings }) {
  return (
    <div className="flex flex-wrap gap-1">
      {!p.sheetActive && <Badge tone="stone">Active = No in sheet</Badge>}
      {p.hiddenByClient && <Badge tone="amber">Hidden by you</Badge>}
      {p.availableQty <= 0 ? (
        <Badge tone="red">{settings.outOfStockMode === "hide" ? "Out of stock · hidden" : "Out of stock"}</Badge>
      ) : settings.lowStockThreshold > 0 && p.availableQty <= settings.lowStockThreshold ? (
        <Badge tone="amber">Only {p.availableQty} left</Badge>
      ) : null}
    </div>
  );
}

export function priceUnit(priceType: "PIECE" | "SET") {
  return priceType === "SET" ? "/ set" : "/ pc";
}
