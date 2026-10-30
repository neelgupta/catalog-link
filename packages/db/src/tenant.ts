import { Prisma } from "./generated/prisma/client";

/** Models that carry a `clientId` column. Keep in sync with schema.prisma. */
export const TENANT_MODELS = new Set<string>([
  "Subscription",
  "SubscriptionPayment",
  "ClientCounter",
  "SheetConnection",
  "SyncRun",
  "SyncRowError",
  "Product",
  "ProductImage",
  "CatalogLink",
  "Customer",
  "CustomerLink",
  "Order",
  "OrderItem",
  "OrderStatusHistory",
]);

const WHERE_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
]);

const CREATE_OPS = new Set(["create", "createMany", "createManyAndReturn"]);

type Args = Record<string, unknown> & {
  where?: Record<string, unknown>;
  data?: unknown;
  create?: Record<string, unknown>;
};

/** Adds `clientId` to a where clause. A caller's own clientId filter is kept as an extra AND
 *  condition, so asking for another client's rows matches nothing instead of being rewritten. */
function scopeWhere(where: Record<string, unknown> | undefined, clientId: string) {
  const scoped: Record<string, unknown> = { ...(where ?? {}), clientId };
  if (where && "clientId" in where && where.clientId !== clientId) {
    const existing = where.AND === undefined ? [] : Array.isArray(where.AND) ? where.AND : [where.AND];
    scoped.AND = [...existing, { clientId: where.clientId }];
  }
  return scoped;
}

/**
 * Pure transform used by the extension: scopes a query's args to one client.
 * - reads/updates/deletes get `where.clientId = clientId`
 * - creates get `data.clientId = clientId` (overriding anything passed in)
 * - upserts get both
 */
export function scopeArgs(operation: string, rawArgs: unknown, clientId: string): Args {
  const args: Args = { ...((rawArgs ?? {}) as Args) };

  if (WHERE_OPS.has(operation) || operation === "upsert") {
    args.where = scopeWhere(args.where, clientId);
  }

  if (CREATE_OPS.has(operation)) {
    args.data = Array.isArray(args.data)
      ? args.data.map((row) => ({ ...(row as object), clientId }))
      : { ...((args.data ?? {}) as object), clientId };
  }

  if (operation === "upsert") {
    args.create = { ...(args.create ?? {}), clientId };
  }

  return args;
}

export function tenantExtension(clientId: string) {
  if (!clientId) throw new Error("tenantExtension requires a clientId");

  return Prisma.defineExtension({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);
          return query(scopeArgs(operation, args, clientId) as typeof args);
        },
      },
    },
  });
}
