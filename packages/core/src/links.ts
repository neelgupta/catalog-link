import { forClient, Prisma, prisma, type LinkSelectionType } from "@cataloglink/db";
import type { LinkCreateInput, LinkPricing, LinkUpdateInput } from "@cataloglink/validation";
import { slugTaken } from "./clients";
import { DomainError } from "./errors";
import { freeProducts, NO_PRICING } from "./link-pricing";
import { uniqueSlug } from "./slug";
import { getCurrentSubscription } from "./subscriptions";

type Tx = Prisma.TransactionClient;
type Selection = { selectionType: LinkSelectionType; selectionValues: Prisma.JsonValue };

/** Products that may appear on any link: still in the sheet, Active = Yes, and not hidden by the client. */
export const VISIBLE_PRODUCT = {
  removedFromSheetAt: null,
  sheetActive: true,
  hiddenByClient: false,
} satisfies Prisma.ProductWhereInput;

export function selectionValuesOf(link: Pick<Selection, "selectionValues">): string[] {
  return Array.isArray(link.selectionValues) ? link.selectionValues.filter((v): v is string => typeof v === "string") : [];
}

/** Which products a link selects (combine with VISIBLE_PRODUCT and the clientId). */
export function linkProductWhere(link: Selection): Prisma.ProductWhereInput {
  const values = selectionValuesOf(link);
  switch (link.selectionType) {
    case "ALL":
      return {};
    // Names are matched case-insensitively so "saree" in the sheet still matches a "Saree" link.
    case "CATEGORY":
      return { OR: values.map((v) => ({ category: { equals: v, mode: "insensitive" as const } })) };
    case "CATALOG":
      return { OR: values.map((v) => ({ catalogName: { equals: v, mode: "insensitive" as const } })) };
    case "PRODUCTS":
      return { id: { in: values } };
  }
}

/** Number of products currently shown on a link. */
export function countLinkProducts(clientId: string, link: Selection) {
  return forClient(clientId).product.count({ where: { ...VISIBLE_PRODUCT, ...linkProductWhere(link) } });
}

/** Custom links used vs. allowed by the current plan (the default link doesn't count). */
export async function linkUsage(clientId: string, db: Tx = prisma) {
  const [used, subscription] = await Promise.all([
    db.catalogLink.count({ where: { clientId, isDefault: false } }),
    getCurrentSubscription(clientId, db),
  ]);
  return { used, limit: subscription?.plan.maxCustomLinks ?? 0 };
}

/** De-duplicated selection values; product ids are kept only when they belong to the client. */
/**
 * Pricing as stored: only for custom links, only for this client's products, and refused when a ₹
 * discount would make a product on the link free (discounts only lower prices).
 */
async function cleanPricing(
  tx: Tx,
  clientId: string,
  isDefault: boolean,
  selection: { selectionType: LinkSelectionType; selectionValues: string[] },
  pricing: LinkPricing | undefined,
): Promise<LinkPricing> {
  if (isDefault || !pricing || pricing.mode === "NONE") return NO_PRICING;
  const own = async (ids: string[]) => {
    const found = await tx.product.findMany({ where: { clientId, id: { in: ids } }, select: { id: true } });
    const known = new Set(found.map((p) => p.id));
    return ids.filter((id) => known.has(id));
  };
  let clean: LinkPricing = pricing;
  if (pricing.mode === "GROUP") {
    const productIds = await own([...new Set(pricing.productIds)]);
    if (!productIds.length) throw new DomainError("PRICING_EMPTY", "Pick at least one product for the discount", "pricing");
    clean = { ...pricing, productIds };
  } else if (pricing.mode === "EACH") {
    const ids = await own(Object.keys(pricing.discounts));
    if (!ids.length) throw new DomainError("PRICING_EMPTY", "Give at least one product a discount", "pricing");
    clean = { mode: "EACH", discounts: Object.fromEntries(ids.map((id) => [id, pricing.discounts[id]!])) };
  }
  const onLink = await tx.product.findMany({
    where: { clientId, removedFromSheetAt: null, ...linkProductWhere(selection) },
    select: { id: true, name: true, price: true },
  });
  const free = freeProducts(clean, onLink.map((p) => ({ id: p.id, name: p.name, price: Number(p.price) })));
  if (free.length) {
    const names = free.slice(0, 3).map((p) => p.name).join(", ");
    throw new DomainError(
      "DISCOUNT_TOO_BIG",
      `The discount is more than the price of ${free.length === 1 ? names : `${free.length} products (${names}${free.length > 3 ? "…" : ""})`}. Use a smaller discount.`,
      "pricing",
    );
  }
  return clean;
}

async function cleanSelection(tx: Tx, clientId: string, type: LinkSelectionType, values: string[]) {
  if (type === "ALL") return [];
  const unique = [...new Map(values.map((v) => [v.toLowerCase(), v])).values()];
  if (type !== "PRODUCTS") return unique;
  const owned = await tx.product.findMany({ where: { clientId, id: { in: values } }, select: { id: true } });
  if (!owned.length) throw new DomainError("NO_PRODUCTS", "Choose at least one product", "selectionValues");
  const ownedIds = new Set(owned.map((p) => p.id));
  return [...new Set(values)].filter((id) => ownedIds.has(id));
}

function isUniqueViolation(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

const SLUG_TAKEN = () => new DomainError("SLUG_TAKEN", "This link address is already taken. Try another one.", "slug");

/** Creates a custom link, within the plan's custom-link limit. An empty slug is generated from the name. */
/** `pricing` may be left out (no discount). */
type WithOptionalPricing<T> = Omit<T, "pricing"> & { pricing?: LinkPricing };

export async function createLink(clientId: string, input: WithOptionalPricing<LinkCreateInput>) {
  try {
    return await prisma.$transaction(async (tx) => {
      // Serialise link creation per client so two requests can't both pass the limit check.
      await tx.$queryRaw`SELECT id FROM "Client" WHERE id = ${clientId} FOR UPDATE`;
      const client = await tx.client.findUniqueOrThrow({ where: { id: clientId }, select: { slug: true } });

      const { used, limit } = await linkUsage(clientId, tx);
      if (used >= limit) {
        throw new DomainError(
          "LINK_LIMIT",
          limit === 0
            ? "Your plan doesn't include custom links. Ask CatalogLink support to upgrade your plan."
            : `Your plan allows ${limit} custom link${limit === 1 ? "" : "s"}. Delete a link you no longer use, or ask CatalogLink support to upgrade your plan.`,
        );
      }

      let slug = input.slug;
      if (!slug) slug = await uniqueSlug(`${client.slug} ${input.name}`, (s) => slugTaken(tx, s));
      else if (await slugTaken(tx, slug)) throw SLUG_TAKEN();

      const selectionValues = await cleanSelection(tx, clientId, input.selectionType, input.selectionValues);
      return tx.catalogLink.create({
        data: {
          clientId,
          slug,
          name: input.name,
          isDefault: false,
          selectionType: input.selectionType,
          selectionValues,
          pricing: await cleanPricing(tx, clientId, false, { selectionType: input.selectionType, selectionValues }, input.pricing),
          showPrice: input.showPrice,
          allowOrdering: input.allowOrdering,
          isActive: input.isActive,
        },
      });
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw SLUG_TAKEN();
    throw err;
  }
}

/**
 * Updates a link's name, products and options. The address never changes. The default link always
 * shows all products and stays active (deactivate the client to switch the catalog off).
 */
export async function updateLink(clientId: string, linkId: string, input: WithOptionalPricing<LinkUpdateInput>) {
  return prisma.$transaction(async (tx) => {
    const link = await tx.catalogLink.findFirst({ where: { id: linkId, clientId } });
    if (!link) throw new DomainError("LINK_NOT_FOUND", "Link not found");
    const selectionType = link.isDefault ? "ALL" : input.selectionType;
    const selectionValues = await cleanSelection(tx, clientId, selectionType, input.selectionValues);
    return tx.catalogLink.update({
      where: { id: link.id },
      data: {
        name: input.name,
        selectionType,
        selectionValues,
        pricing: await cleanPricing(tx, clientId, link.isDefault, { selectionType, selectionValues }, input.pricing),
        showPrice: input.showPrice,
        allowOrdering: input.allowOrdering,
        isActive: link.isDefault ? true : input.isActive,
      },
    });
  });
}

/** Deletes a custom link. Orders placed through it are kept (their link is cleared). */
export async function deleteLink(clientId: string, linkId: string) {
  const link = await forClient(clientId).catalogLink.findFirst({ where: { id: linkId }, select: { id: true, isDefault: true } });
  if (!link) throw new DomainError("LINK_NOT_FOUND", "Link not found");
  if (link.isDefault) throw new DomainError("DEFAULT_LINK", "The default link can't be deleted");
  await forClient(clientId).catalogLink.delete({ where: { id: link.id } });
}

/** Text for the WhatsApp share button. */
export function linkShareText(businessName: string, linkName: string, url: string, isDefault: boolean) {
  return isDefault
    ? `${businessName} – see our latest catalog and order online: ${url}`
    : `${businessName} – ${linkName}: ${url}`;
}

export function whatsappShareUrl(text: string) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
