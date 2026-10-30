import { getEnv } from "@cataloglink/core/env";
import { verifyPoToken } from "@cataloglink/core/orders";
import { prisma } from "@cataloglink/db";
import type { CatalogContext } from "@cataloglink/core/catalog";

/** The order a customer's PO link opens (null for a wrong, expired or other seller's link). */
export async function orderFromPoToken(ctx: CatalogContext, token: string) {
  const orderId = await verifyPoToken(decodeURIComponent(token), ctx.client.id, getEnv().SESSION_SECRET);
  if (!orderId) return null;
  return prisma.order.findFirst({
    where: { id: orderId, clientId: ctx.client.id },
    include: { items: { orderBy: { id: "asc" } }, link: { select: { showPrice: true } } },
  });
}
