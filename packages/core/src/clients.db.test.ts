import { randomInt, randomUUID } from "node:crypto";
import { prisma } from "@cataloglink/db";
import { clientCreateSchema } from "@cataloglink/validation";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifyPassword } from "./auth/password";
import { createClient, deleteClient, resetOwnerPassword, setClientStatus, updateClient } from "./clients";
import { DomainError } from "./errors";
import { createPlan, deletePlan } from "./plans";
import { assignSubscription, getCurrentSubscription } from "./subscriptions";

// Everything created here is unique to this run and removed afterwards.
const run = randomUUID().slice(0, 6);
const mobile = () => `9${randomInt(100_000_000, 999_999_999)}`;
const createdClients: string[] = [];
let planId: string;

function input(name: string, overrides: Record<string, unknown> = {}) {
  return clientCreateSchema.parse({
    businessName: name,
    ownerName: "Ramesh",
    mobile: mobile(),
    email: `${randomUUID().slice(0, 8)}@test.local`,
    city: "Surat",
    password: "initial-pass",
    planId,
    trialDays: "14",
    ...overrides,
  });
}

async function make(name: string, overrides: Record<string, unknown> = {}) {
  const c = await createClient(input(name, overrides));
  createdClients.push(c.id);
  return c;
}

describe("client lifecycle (Postgres)", () => {
  beforeAll(async () => {
    planId = (await createPlan({ name: `Test ${run}`, maxProducts: 100, maxCustomLinks: 2, maxStaff: 0, maxOrdersPerMonth: 50, price: 0, durationDays: 365, isActive: true })).id;
  });

  afterAll(async () => {
    for (const id of createdClients) await deleteClient(id).catch(() => undefined);
    await prisma.plan.deleteMany({ where: { name: { startsWith: `Test ${run}` } } });
    await prisma.$disconnect();
  });

  it("creates the client, owner login, default link, counter and trial subscription together", async () => {
    const c = await make(`Shree Krishna ${run}`);
    expect(c.slug).toBe(`shree-krishna-${run}`);

    const full = await prisma.client.findUniqueOrThrow({
      where: { id: c.id },
      include: { users: true, links: true, counter: true, subscriptions: true },
    });
    expect(full.users).toHaveLength(1);
    expect(full.users[0]).toMatchObject({ role: "CLIENT_OWNER", email: c.email, mobile: c.mobile });
    expect(await verifyPassword(full.users[0]!.passwordHash, "initial-pass")).toBe(true);
    expect(full.links).toEqual([expect.objectContaining({ slug: c.slug, isDefault: true, selectionType: "ALL" })]);
    expect(full.counter?.nextOrderNo).toBe(1001);
    expect(full.subscriptions[0]).toMatchObject({ status: "TRIAL", trialDays: 14 });
    const days = (full.subscriptions[0]!.expiresAt.getTime() - full.subscriptions[0]!.startAt.getTime()) / 86_400_000;
    expect(days).toBe(14);
  });

  it("gives a second client with the same name a numbered slug", async () => {
    const c = await make(`Shree Krishna ${run}`);
    expect(c.slug).toBe(`shree-krishna-${run}-2`);
  });

  it("rejects an email or mobile already used by another client owner", async () => {
    const first = await make(`Dup ${run}`);
    await expect(createClient(input(`Dup2 ${run}`, { email: first.email }))).rejects.toMatchObject({ code: "EMAIL_TAKEN", field: "email" });
    await expect(createClient(input(`Dup3 ${run}`, { mobile: first.mobile }))).rejects.toMatchObject({ code: "MOBILE_TAKEN", field: "mobile" });
    expect(await prisma.client.count({ where: { businessName: { in: [`Dup2 ${run}`, `Dup3 ${run}`] } } })).toBe(0);
  });

  it("mirrors email/mobile changes to the owner login and never changes the slug", async () => {
    const c = await make(`Edit Me ${run}`);
    const email = `${randomUUID().slice(0, 8)}@test.local`;
    const newMobile = mobile();
    const updated = await updateClient(c.id, {
      businessName: `Renamed ${run}`, ownerName: "Suresh", mobile: newMobile, email, city: "Ahmedabad", gst: undefined, address: undefined,
    });
    expect(updated).toMatchObject({ businessName: `Renamed ${run}`, slug: c.slug, city: "Ahmedabad" });
    const owner = await prisma.user.findFirstOrThrow({ where: { clientId: c.id } });
    expect(owner).toMatchObject({ email, mobile: newMobile, name: "Suresh" });
  });

  it("resets the owner password and toggles status", async () => {
    const c = await make(`Status ${run}`);
    await resetOwnerPassword(c.id, "brand-new-pass");
    const owner = await prisma.user.findFirstOrThrow({ where: { clientId: c.id } });
    expect(await verifyPassword(owner.passwordHash, "brand-new-pass")).toBe(true);
    expect((await setClientStatus(c.id, "INACTIVE")).status).toBe("INACTIVE");
  });

  it("assigning a plan cancels the previous subscription", async () => {
    const c = await make(`Renew ${run}`);
    await assignSubscription(c.id, { planId, startAt: new Date("2026-11-01"), expiresAt: new Date("2027-11-01"), trialDays: 0 });
    const subs = await prisma.subscription.findMany({ where: { clientId: c.id }, orderBy: { createdAt: "asc" } });
    expect(subs.map((s) => s.status)).toEqual(["CANCELLED", "ACTIVE"]);
    expect((await getCurrentSubscription(c.id))?.expiresAt.toISOString()).toBe("2027-11-01T00:00:00.000Z");
  });

  it("deletes a client with customers and orders, and everything under it", async () => {
    const c = await make(`Delete Me ${run}`);
    const customer = await prisma.customer.create({ data: { clientId: c.id, name: "Buyer", mobile: mobile() } });
    await prisma.order.create({
      data: {
        clientId: c.id, orderNo: 1001, customerId: customer.id, paymentMode: "PAY_LATER",
        subtotal: 100, gstTotal: 5, grandTotal: 105, customerName: "Buyer", mobile: customer.mobile, deliveryAddress: "Surat",
      },
    });
    await deleteClient(c.id);
    expect(await prisma.client.findUnique({ where: { id: c.id } })).toBeNull();
    expect(await prisma.user.count({ where: { clientId: c.id } })).toBe(0);
    expect(await prisma.order.count({ where: { clientId: c.id } })).toBe(0);
    expect(await prisma.customer.count({ where: { clientId: c.id } })).toBe(0);
    expect(await prisma.catalogLink.count({ where: { clientId: c.id } })).toBe(0);
  });

  it("refuses to delete a plan that was assigned", async () => {
    await expect(deletePlan(planId)).rejects.toBeInstanceOf(DomainError);
    const unused = await createPlan({ name: `Test ${run} unused`, maxProducts: 1, maxCustomLinks: 0, maxStaff: 0, maxOrdersPerMonth: 1, price: 0, durationDays: 30, isActive: true });
    await expect(deletePlan(unused.id)).resolves.toBeUndefined();
  });
});
