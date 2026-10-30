import { customerCookieName } from "@cataloglink/core/session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiError, crossSiteBlocked } from "@/lib/api";
import { getCatalogContext } from "@/lib/catalog";

/** "Not you?": ends the customer's session with this seller. */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const blocked = crossSiteBlocked(request);
  if (blocked) return blocked;
  const ctx = await getCatalogContext((await params).slug);
  if (!ctx) return apiError(404, "CATALOG_NOT_AVAILABLE", "This catalog link is not active");
  (await cookies()).delete(customerCookieName(ctx.client.id));
  return NextResponse.json({ ok: true });
}
