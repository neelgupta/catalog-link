import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";
import { tenantExtension } from "./tenant";

export * from "./generated/prisma/client";
export { TENANT_MODELS } from "./tenant";

function createPrisma(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

declare global {
  var __cataloglinkPrisma: PrismaClient | undefined;
}

/**
 * Unscoped client. Use only in Super Admin code, the worker and seeds.
 * Client-facing code must use `db.forClient(clientId)`.
 */
export const prisma: PrismaClient = globalThis.__cataloglinkPrisma ?? createPrisma();
if (process.env.NODE_ENV !== "production") globalThis.__cataloglinkPrisma = prisma;

/** A Prisma client whose tenant-table queries are always filtered to one client. */
export function forClient(clientId: string) {
  return prisma.$extends(tenantExtension(clientId));
}
export type TenantDb = ReturnType<typeof forClient>;

export const db = { forClient };
export { createPrisma };
