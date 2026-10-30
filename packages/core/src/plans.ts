import { Prisma, prisma } from "@cataloglink/db";
import type { PlanInput } from "@cataloglink/validation";
import { DomainError } from "./errors";

function nameTaken(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export async function createPlan(input: PlanInput) {
  try {
    return await prisma.plan.create({ data: input });
  } catch (err) {
    if (nameTaken(err)) throw new DomainError("PLAN_NAME_TAKEN", "A plan with this name already exists", "name");
    throw err;
  }
}

export async function updatePlan(planId: string, input: PlanInput) {
  try {
    return await prisma.plan.update({ where: { id: planId }, data: input });
  } catch (err) {
    if (nameTaken(err)) throw new DomainError("PLAN_NAME_TAKEN", "A plan with this name already exists", "name");
    throw err;
  }
}

/** Plans that were ever assigned are kept for history; deactivate them instead. */
export async function deletePlan(planId: string) {
  const used = await prisma.subscription.count({ where: { planId } });
  if (used > 0) {
    throw new DomainError("PLAN_IN_USE", "This plan has been assigned to clients. Deactivate it instead of deleting.");
  }
  await prisma.plan.delete({ where: { id: planId } });
}

export function listPlans() {
  return prisma.plan.findMany({
    orderBy: [{ isActive: "desc" }, { price: "asc" }],
    include: { _count: { select: { subscriptions: { where: { status: { in: ["TRIAL", "ACTIVE"] } } } } } },
  });
}
