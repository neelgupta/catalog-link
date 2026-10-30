// The seller's customers: created automatically from orders, or added by hand.
import { forClient, Prisma, prisma } from "@cataloglink/db";
import type { CustomerInput } from "@cataloglink/validation";
import { DomainError } from "./errors";

export type CustomerFilters = { q?: string; blocked?: boolean };

/** Customers with order count, total of their non-cancelled orders and last order date. */
export async function listCustomers(clientId: string, f: CustomerFilters = {}, page = 1, pageSize = 30) {
  const q = f.q?.trim();
  const digits = q?.replace(/\D/g, "") ?? "";
  const where: Prisma.CustomerWhereInput = {
    ...(f.blocked && { isBlocked: true }),
    ...(q && {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { shopName: { contains: q, mode: "insensitive" } },
        { city: { contains: q, mode: "insensitive" } },
        ...(digits.length >= 4 ? [{ mobile: { contains: digits } }] : []),
      ],
    }),
  };
  const db = forClient(clientId);
  const [customers, total] = await Promise.all([
    db.customer.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (Math.max(1, page) - 1) * pageSize, take: pageSize }),
    db.customer.count({ where }),
  ]);
  const stats = customers.length
    ? await db.order.groupBy({
        by: ["customerId"],
        where: { customerId: { in: customers.map((c) => c.id) } },
        _count: { _all: true },
        _max: { createdAt: true },
      })
    : [];
  const spent = customers.length
    ? await db.order.groupBy({
        by: ["customerId"],
        where: { customerId: { in: customers.map((c) => c.id) }, status: { notIn: ["REJECTED", "CANCELLED"] } },
        _sum: { grandTotal: true },
      })
    : [];
  return {
    total,
    customers: customers.map((c) => {
      const s = stats.find((x) => x.customerId === c.id);
      return {
        ...c,
        orderCount: s?._count._all ?? 0,
        lastOrderAt: s?._max.createdAt ?? null,
        totalSpent: Number(spent.find((x) => x.customerId === c.id)?._sum.grandTotal ?? 0),
      };
    }),
  };
}

export function getCustomer(clientId: string, customerId: string) {
  return forClient(clientId).customer.findFirst({
    where: { id: customerId },
    include: {
      links: { include: { link: { select: { id: true, name: true, slug: true, isActive: true } } } },
      orders: { orderBy: { createdAt: "desc" }, take: 100, include: { _count: { select: { items: true } } } },
    },
  });
}

/** Link ids that belong to this client (others are dropped). */
async function ownLinkIds(tx: Prisma.TransactionClient, clientId: string, ids: string[]) {
  if (!ids.length) return [];
  const links = await tx.catalogLink.findMany({ where: { clientId, id: { in: ids } }, select: { id: true } });
  return links.map((l) => l.id);
}

function details(input: CustomerInput) {
  return {
    name: input.name,
    shopName: input.shopName ?? null,
    city: input.city ?? null,
    address: input.address ?? null,
    gst: input.gst ?? null,
  };
}

const MOBILE_TAKEN = () => new DomainError("MOBILE_TAKEN", "A customer with this mobile number already exists", "mobile");

export async function createCustomer(clientId: string, input: CustomerInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      const linkIds = await ownLinkIds(tx, clientId, input.linkIds);
      return tx.customer.create({
        data: {
          clientId,
          mobile: input.mobile,
          source: "MANUAL",
          ...details(input),
          links: { create: linkIds.map((linkId) => ({ clientId, linkId })) },
        },
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw MOBILE_TAKEN();
    throw err;
  }
}

/** Updates details and the assigned links. Past orders keep the details they were placed with. */
export async function updateCustomer(clientId: string, customerId: string, input: CustomerInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.customer.findFirst({
        where: { id: customerId, clientId },
        select: { mobile: true, _count: { select: { orders: true } } },
      });
      if (!existing) throw new DomainError("CUSTOMER_NOT_FOUND", "Customer not found");
      // "My orders" finds a customer's orders by mobile, so it can't change once they have orders.
      if (existing.mobile !== input.mobile && existing._count.orders > 0) {
        throw new DomainError("MOBILE_LOCKED", "This customer has orders, so the mobile number can't be changed", "mobile");
      }
      const linkIds = await ownLinkIds(tx, clientId, input.linkIds);
      await tx.customerLink.deleteMany({ where: { customerId, clientId, linkId: { notIn: linkIds } } });
      for (const linkId of linkIds) {
        await tx.customerLink.upsert({
          where: { customerId_linkId: { customerId, linkId } },
          update: {},
          create: { clientId, customerId, linkId },
        });
      }
      return tx.customer.update({ where: { id: customerId }, data: { mobile: input.mobile, ...details(input) } });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw MOBILE_TAKEN();
    throw err;
  }
}

/** A blocked customer can still browse but can't place orders. */
export async function setCustomerBlocked(clientId: string, customerId: string, blocked: boolean) {
  const { count } = await forClient(clientId).customer.updateMany({ where: { id: customerId }, data: { isBlocked: blocked } });
  if (!count) throw new DomainError("CUSTOMER_NOT_FOUND", "Customer not found");
}
