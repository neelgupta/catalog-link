import { ORDER_TABS, type OrderTab } from "@cataloglink/core/orders";
import { ordersWorkbook } from "@cataloglink/core/order-documents";
import { requireClient } from "@/lib/auth";

/** Excel export of orders (one row per item) with the same filters as the orders list. */
export async function GET(request: Request) {
  const { clientId } = await requireClient();
  const sp = new URL(request.url).searchParams;
  const tab = (sp.get("status") ?? "all") as OrderTab;
  const xlsx = await ordersWorkbook(clientId, {
    tab: tab in ORDER_TABS ? tab : "all",
    q: sp.get("q") ?? undefined,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
  });
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  return new Response(new Uint8Array(xlsx), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="orders-${day}.xlsx"`,
      "cache-control": "private, no-store",
    },
  });
}
