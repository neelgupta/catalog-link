import { orderPdf } from "@cataloglink/core/order-documents";
import { forClient } from "@cataloglink/db";
import { apiError } from "@/lib/api";
import { requireClient } from "@/lib/auth";

/** Order PDF (?type=order, default) or packing slip (?type=packing); &download=1 to save it. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { clientId } = await requireClient();
  const { id } = await params;
  const search = new URL(request.url).searchParams;
  const kind = search.get("type") === "packing" ? "packing" : "order";
  const pdf = await orderPdf(clientId, id, kind);
  if (!pdf) return apiError(404, "NOT_FOUND", "Order not found");
  const { orderNo } = (await forClient(clientId).order.findFirst({ where: { id }, select: { orderNo: true } }))!;
  const name = `${kind === "packing" ? "packing-slip" : "order"}-${orderNo}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${search.get("download") ? "attachment" : "inline"}; filename="${name}"`,
      "cache-control": "private, no-store",
    },
  });
}
