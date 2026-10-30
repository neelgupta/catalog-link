// The seller's side of orders: list, detail, status changes and payment.
import { forClient, prisma, type OrderStatus, type Prisma } from "@cataloglink/db";
import { DomainError } from "../errors";
import { assertTransition, CLOSING_STATUSES, ORDER_TABS, type OrderTab } from "./status";

type Tx = Prisma.TransactionClient;

export type OrderFilters = {
  tab: OrderTab;
  /** Order number, customer name, shop or mobile. */
  q?: string;
  /** YYYY-MM-DD, IST calendar days, inclusive. */
  from?: string;
  to?: string;
  /** Only orders placed through this catalog link. */
  linkId?: string;
};

const IST_DAY = /^\d{4}-\d{2}-\d{2}$/;
const istStart = (day: string) => new Date(`${day}T00:00:00.000+05:30`);

/** Where-clause for the filters, without the status tab (so tab counts can reuse it). */
export function orderSearchWhere(f: Omit<OrderFilters, "tab">): Prisma.OrderWhereInput {
  const q = f.q?.trim().replace(/^#/, "");
  const digits = q?.replace(/\D/g, "") ?? "";
  const created: Prisma.DateTimeFilter = {};
  if (f.from && IST_DAY.test(f.from)) created.gte = istStart(f.from);
  if (f.to && IST_DAY.test(f.to)) created.lt = new Date(istStart(f.to).getTime() + 86_400_000);
  return {
    ...(f.linkId && { linkId: f.linkId }),
    ...(Object.keys(created).length && { createdAt: created }),
    ...(q && {
      OR: [
        ...(/^\d{1,9}$/.test(q) ? [{ orderNo: Number(q) }] : []),
        { customerName: { contains: q, mode: "insensitive" as const } },
        { shopName: { contains: q, mode: "insensitive" as const } },
        { city: { contains: q, mode: "insensitive" as const } },
        ...(digits.length >= 4 ? [{ mobile: { contains: digits } }] : []),
      ],
    }),
  };
}

export function tabWhere(tab: OrderTab): Prisma.OrderWhereInput {
  const statuses = (ORDER_TABS[tab] ?? ORDER_TABS.all!).statuses;
  return statuses.length ? { status: { in: [...statuses] } } : {};
}

/** One page of orders plus the count for every tab (with the same search and dates). */
export async function listOrders(clientId: string, f: OrderFilters, page = 1, pageSize = 25) {
  const db = forClient(clientId);
  const search = orderSearchWhere(f);
  const where = { ...search, ...tabWhere(f.tab) };
  const [orders, total, byStatus] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (Math.max(1, page) - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { items: true } }, items: { select: { imageUrl: true }, take: 1 }, link: { select: { name: true } } },
    }),
    db.order.count({ where }),
    db.order.groupBy({ by: ["status"], where: search, _count: { _all: true } }),
  ]);
  const counts = Object.fromEntries(
    (Object.keys(ORDER_TABS) as OrderTab[]).map((tab) => {
      const statuses = ORDER_TABS[tab]!.statuses;
      const n = byStatus.filter((s) => !statuses.length || statuses.includes(s.status)).reduce((sum, s) => sum + s._count._all, 0);
      return [tab, n];
    }),
  ) as Record<OrderTab, number>;
  return { orders, total, counts };
}

export function getOrder(clientId: string, orderId: string) {
  return forClient(clientId).order.findFirst({
    where: { id: orderId },
    include: {
      items: { orderBy: { id: "asc" } },
      history: { orderBy: { createdAt: "asc" } },
      customer: { select: { id: true, isBlocked: true, _count: { select: { orders: true } } } },
      link: { select: { name: true, slug: true, isDefault: true } },
    },
  });
}

/** Orders in the "New" tab, for the badge (just PLACED in the full flow; every open order in the simple one). */
export function newOrderCount(clientId: string) {
  return forClient(clientId).order.count({ where: tabWhere("new") });
}

/** Gives an order's held stock back to its products (used when an order is rejected or cancelled). */
export async function restoreStock(tx: Tx, clientId: string, orderId: string) {
  const items = await tx.orderItem.findMany({ where: { orderId, clientId, productId: { not: null } }, select: { productId: true, qty: true } });
  for (const item of items) {
    await tx.product.updateMany({ where: { id: item.productId!, clientId }, data: { availableQty: { increment: item.qty } } });
  }
}

/**
 * Moves an order to its next status. Rejecting or cancelling needs a reason and returns the held
 * stock. `note` is optional extra detail kept in the history (e.g. transport / LR number on dispatch).
 */
export async function changeOrderStatus(
  clientId: string,
  orderId: string,
  to: OrderStatus,
  opts: { userId?: string; reason?: string; note?: string } = {},
) {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ status: OrderStatus }[]>`
      SELECT status FROM "Order" WHERE id = ${orderId} AND "clientId" = ${clientId} FOR UPDATE`;
    const from = locked[0]?.status;
    if (!from) throw new DomainError("ORDER_NOT_FOUND", "Order not found");
    const reason = opts.reason?.trim() || undefined;
    assertTransition(from, to, reason);

    if (CLOSING_STATUSES.includes(to)) await restoreStock(tx, clientId, orderId);
    const order = await tx.order.update({
      where: { id: orderId },
      data: {
        status: to,
        ...(CLOSING_STATUSES.includes(to) && { rejectReason: reason, cancelledBy: to === "CANCELLED" ? "seller" : null }),
      },
    });
    const note = [reason, opts.note?.trim()].filter(Boolean).join(" · ") || null;
    await tx.orderStatusHistory.create({ data: { clientId, orderId, fromStatus: from, toStatus: to, byUserId: opts.userId ?? null, note } });
    return order;
  });
}

/** Marks payment received (or not). Not for rejected/cancelled orders. */
export async function setPaymentReceived(clientId: string, orderId: string, received: boolean) {
  const order = await forClient(clientId).order.findFirst({ where: { id: orderId }, select: { status: true } });
  if (!order) throw new DomainError("ORDER_NOT_FOUND", "Order not found");
  if (CLOSING_STATUSES.includes(order.status)) throw new DomainError("ORDER_CLOSED", "This order is cancelled.");
  return forClient(clientId).order.update({ where: { id: orderId }, data: { paymentReceived: received } });
}
