import { prisma, type Prisma, type SubscriptionStatus } from "@cataloglink/db";
import type { PaymentInput, SubscriptionInput } from "@cataloglink/validation";
import { DomainError } from "./errors";

const DAY_MS = 24 * 60 * 60 * 1000;
export const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);

/** Trial when trialDays > 0 (expires after the trial), otherwise paid for the plan's duration. */
export function subscriptionTerms(startAt: Date, trialDays: number, planDurationDays: number) {
  return trialDays > 0
    ? { status: "TRIAL" as const, expiresAt: addDays(startAt, trialDays) }
    : { status: "ACTIVE" as const, expiresAt: addDays(startAt, planDurationDays) };
}

const CURRENT: SubscriptionStatus[] = ["TRIAL", "ACTIVE"];

/** The client's current subscription: the latest trial/active one (it may already be past expiry). */
export function getCurrentSubscription(clientId: string, db: Prisma.TransactionClient = prisma) {
  return db.subscription.findFirst({
    where: { clientId, status: { in: CURRENT } },
    orderBy: { createdAt: "desc" },
    include: { plan: true },
  });
}

/** A client's catalog is available when the client is active and the current plan hasn't expired. */
export function isClientAvailable(
  client: { status: "ACTIVE" | "INACTIVE" },
  subscription: { expiresAt: Date } | null,
  now = new Date(),
) {
  return client.status === "ACTIVE" && !!subscription && subscription.expiresAt > now;
}

export function daysLeft(expiresAt: Date, now = new Date()) {
  return Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_MS);
}

/** Starts a new subscription; any earlier trial/active one for the client is cancelled. */
export async function assignSubscription(clientId: string, input: SubscriptionInput) {
  return prisma.$transaction(async (tx) => {
    const plan = await tx.plan.findUnique({ where: { id: input.planId } });
    if (!plan) throw new DomainError("PLAN_NOT_FOUND", "Plan not found", "planId");
    await tx.subscription.updateMany({
      where: { clientId, status: { in: CURRENT } },
      data: { status: "CANCELLED" },
    });
    return tx.subscription.create({
      data: {
        clientId,
        planId: plan.id,
        startAt: input.startAt,
        expiresAt: input.expiresAt,
        trialDays: input.trialDays,
        status: input.trialDays > 0 ? "TRIAL" : "ACTIVE",
      },
    });
  });
}

export async function recordPayment(clientId: string, subscriptionId: string, input: PaymentInput) {
  const sub = await prisma.subscription.findFirst({ where: { id: subscriptionId, clientId } });
  if (!sub) throw new DomainError("SUBSCRIPTION_NOT_FOUND", "Subscription not found");
  return prisma.subscriptionPayment.create({
    data: { clientId, subscriptionId, amount: input.amount, paidAt: input.paidAt, reference: input.reference, note: input.note },
  });
}
