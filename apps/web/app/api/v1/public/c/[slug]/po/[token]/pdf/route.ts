import { orderPdf } from "@cataloglink/core/order-documents";
import { apiError } from "@/lib/api";
import { getCatalogContext } from "@/lib/catalog";
import { orderFromPoToken } from "@/lib/po";

/** The customer's PO slip as a PDF (prices left out if the order's link hides them). */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const ctx = await getCatalogContext(slug);
  if (!ctx) return apiError(404, "CATALOG_NOT_AVAILABLE", "This catalog link is not active");
  const order = await orderFromPoToken(ctx, token);
  if (!order) return apiError(404, "NOT_FOUND", "This PO link is not valid");
  const pdf = await orderPdf(ctx.client.id, order.id, "order", { showPrices: order.link?.showPrice ?? true });
  return new Response(new Uint8Array(pdf!), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="PO-${order.orderNo}.pdf"`,
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex",
    },
  });
}
