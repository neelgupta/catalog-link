import { prisma } from "@cataloglink/db";

/** Plans that can be given to a new client, cheapest first (for the Add client pop-up). */
export function activePlans() {
  return prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { price: "asc" },
    select: { id: true, name: true, durationDays: true },
  });
}
