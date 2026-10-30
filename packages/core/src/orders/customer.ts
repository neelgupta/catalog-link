// What a customer sees and can do with their own orders on a catalog link.
import { prisma, type OrderStatus } from "@cataloglink/db";
import { DomainError } from "../errors";
import { restoreStock } from "./manage";
import { OPEN_STATUSES, SIMPLE_ORDER_FLOW } from "./status";

const FULL_CUSTOMER_STATUS: Record<OrderStatus, string> = {
  PLACED: "Order received",
  CONFIRMED: "Order confirmed",
  PARTIALLY_CONFIRMED: "Partly confirmed",
  PACKED: "Being packed",
  DISPATCHED: "Shipped",
  DELIVERED: "Delivered",
  REJECTED: "Cancelled by seller",
  CANCELLED: "Cancelled",
};

/** Customer-facing status names (docs/IMPLEMENTATION.md §12); two states in the simple flow. */
export const CUSTOMER_STATUS: Record<OrderStatus, string> = SIMPLE_ORDER_FLOW
  ? ({
      ...Object.fromEntries(OPEN_STATUSES.map((s) => [s, "Order received"])),
      DELIVERED: "Completed",
      REJECTED: "Cancelled by seller",
      CANCELLED: "Cancelled",
    } as Record<OrderStatus, string>)
  : FULL_CUSTOMER_STATUS;

export const PAYMENT_MODE_LABEL = { PAY_LATER: "Pay later / credit", UPI: "UPI", BANK: "Bank transfer" } as const;

export async function findCustomer(clientId: string, mobile: string) {
  return prisma.customer.findUnique({ where: { clientId_mobile: { clientId, mobile } } });
}

/** All of this customer's orders with this seller (from any of the seller's links). */
export async function listCustomerOrders(clientId: string, mobile: string) {
  return prisma.order.findMany({
    where: { clientId, mobile },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      items: { select: { name: true, imageUrl: true, qty: true }, take: 3 },
      _count: { select: { items: true } },
      link: { select: { showPrice: true } },
    },
  });
}

export async function getCustomerOrder(clientId: string, mobile: string, orderNo: number) {
  return prisma.order.findFirst({
    where: { clientId, mobile, orderNo },
    include: {
      items: { orderBy: { id: "asc" } },
      history: { orderBy: { createdAt: "asc" } },
      link: { select: { showPrice: true, slug: true } },
    },
  });
}

/** The customer may cancel while the seller hasn't acted on the order yet; held stock is returned. */
export async function cancelOrderByCustomer(clientId: string, mobile: string, orderNo: number, reason?: string) {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string; status: OrderStatus }[]>`
      SELECT id, status FROM "Order" WHERE "clientId" = ${clientId} AND mobile = ${mobile} AND "orderNo" = ${orderNo} FOR UPDATE`;
    const order = locked[0];
    if (!order) throw new DomainError("ORDER_NOT_FOUND", "Order not found");
    if (order.status !== "PLACED") {
      throw new DomainError("CANNOT_CANCEL", "The seller has already started on this order. Please contact them to cancel.");
    }
    await restoreStock(tx, clientId, order.id);
    await tx.order.update({ where: { id: order.id }, data: { status: "CANCELLED", cancelledBy: "customer", rejectReason: reason ?? null } });
    await tx.orderStatusHistory.create({
      data: { clientId, orderId: order.id, fromStatus: "PLACED", toStatus: "CANCELLED", byCustomer: true, note: reason ?? null },
    });
    return order.id;
  });
}
