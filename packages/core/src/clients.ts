import { Prisma, prisma, type ClientStatus } from "@cataloglink/db";
import type { ClientCreateInput, ClientUpdateInput } from "@cataloglink/validation";
import { hashPassword } from "./auth/password";
import { DomainError } from "./errors";
import { uniqueSlug } from "./slug";
import { removeStoredFile, saveClientImage } from "./profile";
import { getStorage } from "./storage";
import { subscriptionTerms } from "./subscriptions";

type Tx = Prisma.TransactionClient;

/** Client slugs and link slugs share one namespace (both live under /c/). */
export async function slugTaken(tx: Tx, slug: string) {
  const [client, link] = await Promise.all([
    tx.client.findUnique({ where: { slug }, select: { id: true } }),
    tx.catalogLink.findUnique({ where: { slug }, select: { id: true } }),
  ]);
  return Boolean(client || link);
}

async function assertOwnerContactsFree(tx: Tx, email: string, mobile: string, exceptUserId?: string) {
  const emailUser = await tx.user.findUnique({ where: { email }, select: { id: true } });
  if (emailUser && emailUser.id !== exceptUserId) {
    throw new DomainError("EMAIL_TAKEN", "This email is already used by another login", "email");
  }
  const mobileUser = await tx.user.findFirst({
    where: { mobile, role: "CLIENT_OWNER", ...(exceptUserId ? { id: { not: exceptUserId } } : {}) },
    select: { id: true },
  });
  if (mobileUser) {
    throw new DomainError("MOBILE_TAKEN", "This mobile number is already used by another client", "mobile");
  }
}

/** Validates an uploaded logo and stores it; returns its public URL. */
export function saveClientLogo(clientId: string, data: Buffer) {
  return saveClientImage(clientId, "logo", data);
}

/**
 * Creates a client with its owner login, default catalog link (same slug), order counter and
 * first subscription, all in one transaction.
 */
export async function createClient(input: ClientCreateInput, logo?: Buffer) {
  const passwordHash = await hashPassword(input.password);
  const startAt = new Date();

  const client = await prisma.$transaction(async (tx) => {
    await assertOwnerContactsFree(tx, input.email, input.mobile);
    const plan = await tx.plan.findUnique({ where: { id: input.planId } });
    if (!plan?.isActive) throw new DomainError("PLAN_NOT_FOUND", "Choose an active plan", "planId");

    const slug = await uniqueSlug(input.businessName, (s) => slugTaken(tx, s));
    const terms = subscriptionTerms(startAt, input.trialDays, plan.durationDays);

    return tx.client.create({
      data: {
        businessName: input.businessName,
        ownerName: input.ownerName,
        mobile: input.mobile,
        email: input.email,
        gst: input.gst,
        city: input.city,
        address: input.address,
        slug,
        users: {
          create: { role: "CLIENT_OWNER", name: input.ownerName, email: input.email, mobile: input.mobile, passwordHash },
        },
        links: { create: { slug, name: "All products", isDefault: true } },
        counter: { create: {} },
        subscriptions: {
          create: { planId: plan.id, startAt, expiresAt: terms.expiresAt, status: terms.status, trialDays: input.trialDays },
        },
      },
    });
  });

  if (logo?.length) {
    try {
      const logoUrl = await saveClientLogo(client.id, logo);
      return prisma.client.update({ where: { id: client.id }, data: { logoUrl } });
    } catch (err) {
      // The client exists; report the logo problem without losing it.
      if (err instanceof DomainError) throw new DomainError(err.code, `Client created, but the logo was not saved: ${err.message}`, "logo");
      throw err;
    }
  }
  return client;
}

/** Updates business details; email/mobile changes are mirrored to the owner login. The slug never changes. */
export async function updateClient(
  clientId: string,
  input: ClientUpdateInput,
  logo?: { upload?: Buffer; remove?: boolean },
) {
  const existing = await prisma.client.findUnique({
    where: { id: clientId },
    include: { users: { where: { role: "CLIENT_OWNER" }, select: { id: true }, take: 1 } },
  });
  if (!existing) throw new DomainError("CLIENT_NOT_FOUND", "Client not found");
  const ownerId = existing.users[0]?.id;

  let logoUrl: string | null | undefined;
  if (logo?.upload?.length) logoUrl = await saveClientLogo(clientId, logo.upload);
  else if (logo?.remove) logoUrl = null;

  const updated = await prisma.$transaction(async (tx) => {
    await assertOwnerContactsFree(tx, input.email, input.mobile, ownerId);
    if (ownerId) {
      await tx.user.update({
        where: { id: ownerId },
        data: { email: input.email, mobile: input.mobile, name: input.ownerName },
      });
    }
    return tx.client.update({
      where: { id: clientId },
      data: {
        businessName: input.businessName,
        ownerName: input.ownerName,
        mobile: input.mobile,
        email: input.email,
        gst: input.gst ?? null,
        city: input.city,
        address: input.address ?? null,
        ...(logoUrl !== undefined ? { logoUrl } : {}),
      },
    });
  });

  if (logoUrl !== undefined && existing.logoUrl && existing.logoUrl !== logoUrl) await removeStoredFile(existing.logoUrl);
  return updated;
}

export function setClientStatus(clientId: string, status: ClientStatus) {
  return prisma.client.update({ where: { id: clientId }, data: { status } });
}

/** Sets a new password for the client's owner login. */
export async function resetOwnerPassword(clientId: string, password: string) {
  const passwordHash = await hashPassword(password);
  const { count } = await prisma.user.updateMany({
    where: { clientId, role: "CLIENT_OWNER" },
    data: { passwordHash },
  });
  if (count === 0) throw new DomainError("OWNER_NOT_FOUND", "This client has no owner login");
}

/**
 * Permanently deletes a client and all its data. Orders go first because Order -> Customer is
 * RESTRICT (customers with orders can't be deleted on their own).
 */
export async function deleteClient(clientId: string) {
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { logoUrl: true, bannerUrl: true } });
  if (!client) throw new DomainError("CLIENT_NOT_FOUND", "Client not found");
  await prisma.$transaction([
    prisma.order.deleteMany({ where: { clientId } }),
    prisma.client.delete({ where: { id: clientId } }),
  ]);
  await getStorage().remove(`clients/${clientId}`).catch(() => undefined);
  await Promise.all([removeStoredFile(client.logoUrl), removeStoredFile(client.bannerUrl)]);
}
