import { DomainError } from "@cataloglink/core/errors";
import { cancelOrderByCustomer } from "@cataloglink/core/orders";
import { enqueueOrderSheetWrite } from "@cataloglink/core/orders-sheet";
import { NextResponse } from "next/server";
import { apiError, crossSiteBlocked, readJson } from "@/lib/api";
import { getCustomerSession } from "@/lib/auth";
import { revalidateClientCatalog } from "@/lib/catalog-cache";
import { getCatalogContext } from "@/lib/catalog";

/** The customer cancels their own order while it is still "Order received". */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string; orderNo: string }> }) {
  const blocked = crossSiteBlocked(request);
  if (blocked) return blocked;
  const { slug, orderNo } = await params;
  const ctx = await getCatalogContext(slug);
  if (!ctx) return apiError(404, "CATALOG_NOT_AVAILABLE", "This catalog link is not active");
  const session = await getCustomerSession(ctx.client.id);
  if (!session) return apiError(401, "LOGIN_REQUIRED", "Please verify your mobile number first.");
  const no = Number(orderNo);
  if (!Number.isInteger(no)) return apiError(404, "ORDER_NOT_FOUND", "Order not found");
  const body = (await readJson(request)) as { reason?: unknown };
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) || undefined : undefined;

  let orderId: string;
  try {
    orderId = await cancelOrderByCustomer(ctx.client.id, session.mobile, no, reason);
  } catch (err) {
    if (err instanceof DomainError) return apiError(err.code === "ORDER_NOT_FOUND" ? 404 : 409, err.code, err.message);
    throw err;
  }
  revalidateClientCatalog(ctx.client.id);
  await enqueueOrderSheetWrite(ctx.client.id, orderId).catch((e) => console.error("[orders-sheet] enqueue failed", e));
  return NextResponse.json({ ok: true });
}
