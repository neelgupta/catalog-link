import { prisma } from "@cataloglink/db";
import { addDays } from "./subscriptions";

/** IST (UTC+5:30) start of day / month, as UTC instants, for "today" and "this month" counts. */
export function istPeriodStarts(now = new Date()) {
  const IST_OFFSET_MS = 330 * 60 * 1000;
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const dayStart = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS;
  const monthStart = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - IST_OFFSET_MS;
  return { today: new Date(dayStart), month: new Date(monthStart) };
}

export async function getAdminDashboard(now = new Date()) {
  const { today, month } = istPeriodStarts(now);
  const [totalClients, activeClients, links, ordersToday, ordersMonth, expiring, syncFailures] = await Promise.all([
    prisma.client.count(),
    prisma.client.count({ where: { status: "ACTIVE" } }),
    prisma.catalogLink.count(),
    prisma.order.count({ where: { createdAt: { gte: today } } }),
    prisma.order.count({ where: { createdAt: { gte: month } } }),
    // Plan-expiry reminders are on hold, so the dashboard lists them instead.
    prisma.subscription.findMany({
      where: { status: { in: ["TRIAL", "ACTIVE"] }, expiresAt: { lte: addDays(now, 7) } },
      orderBy: { expiresAt: "asc" },
      take: 20,
      include: { client: { select: { id: true, businessName: true, mobile: true, status: true } }, plan: { select: { name: true } } },
    }),
    prisma.sheetConnection.findMany({
      where: { lastStatus: "FAILED" },
      orderBy: { lastSyncedAt: "desc" },
      take: 20,
      include: { client: { select: { id: true, businessName: true } } },
    }),
  ]);
  return { totalClients, activeClients, links, ordersToday, ordersMonth, expiring, syncFailures };
}
