// Public catalog: resolving a link, loading what customers may see, and filtering it.
// Results are plain JSON (numbers and ISO strings) so the web app can cache them.
import { forClient, prisma, type Prisma } from "@cataloglink/db";
import { linkProductWhere, selectionValuesOf, VISIBLE_PRODUCT } from "./links";
import { getPlatformSettings } from "./platform";
import { isNewArrival } from "./products";
import { parseClientSettings } from "./profile";
import { getCurrentSubscription, isClientAvailable } from "./subscriptions";

export const CATALOG_PAGE_SIZE = 24;

export type CatalogContext = {
  link: {
    id: string;
    slug: string;
    name: string;
    isDefault: boolean;
    showPrice: boolean;
    allowOrdering: boolean;
    selectionType: "ALL" | "CATEGORY" | "CATALOG" | "PRODUCTS";
    selectionValues: string[];
  };
  client: {
    id: string;
    slug: string;
    businessName: string;
    city: string;
    address: string | null;
    gst: string | null;
    logoUrl: string | null;
    bannerUrl: string | null;
    /** 10-digit Indian mobile for WhatsApp / call buttons. */
    whatsapp: string;
  };
};

type Image = { thumbUrl: string; blurDataUrl: string | null };

/** One product as shown in the grid. `price`/`mrp` are null when the link hides prices. */
export type CatalogItem = {
  id: string;
  sku: string;
  name: string;
  catalogName: string | null;
  category: string;
  fabric: string | null;
  colours: string[];
  sizes: string[];
  piecesPerSet: number | null;
  price: number | null;
  mrp: number | null;
  priceType: "PIECE" | "SET";
  moq: number;
  availableQty: number;
  isNew: boolean;
  /** ISO time the product first appeared in the sheet (for "newest first"). */
  firstSeenAt: string;
  sheetRow: number;
  image: Image | null;
};

export type CatalogSnapshot = {
  items: CatalogItem[];
  /** "Only N left" at or below this qty; 0 = off. */
  lowStockThreshold: number;
};

export type CatalogProduct = CatalogItem & {
  description: string | null;
  videoUrl: string | null;
  gstPct: number | null;
  tags: string[];
  images: (Image & { fullUrl: string })[];
};

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The link and its business, or null when the catalog must show "not available": unknown or switched-off
 * link, deactivated client, or no unexpired plan.
 */
export async function resolveCatalogLink(slug: string, now = new Date()): Promise<CatalogContext | null> {
  if (!SLUG_RE.test(slug) || slug.length > 80) return null;
  const link = await prisma.catalogLink.findUnique({ where: { slug }, include: { client: true } });
  if (!link?.isActive) return null;
  const subscription = await getCurrentSubscription(link.clientId);
  if (!isClientAvailable(link.client, subscription, now)) return null;
  const c = link.client;
  return {
    link: {
      id: link.id,
      slug: link.slug,
      name: link.name,
      isDefault: link.isDefault,
      showPrice: link.showPrice,
      allowOrdering: link.allowOrdering,
      selectionType: link.selectionType,
      selectionValues: selectionValuesOf(link),
    },
    client: {
      id: c.id,
      slug: c.slug,
      businessName: c.businessName,
      city: c.city,
      address: c.address,
      gst: c.gst,
      logoUrl: c.logoUrl,
      bannerUrl: c.bannerUrl,
      whatsapp: c.whatsappNumber ?? c.mobile,
    },
  };
}

async function catalogWhere(ctx: CatalogContext) {
  const [client, platform] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: ctx.client.id }, select: { settings: true } }),
    getPlatformSettings(),
  ]);
  const settings = parseClientSettings(client.settings);
  const where: Prisma.ProductWhereInput = {
    ...VISIBLE_PRODUCT,
    ...linkProductWhere({ selectionType: ctx.link.selectionType, selectionValues: ctx.link.selectionValues }),
    ...(settings.outOfStockMode === "hide" && { availableQty: { gt: 0 } }),
  };
  return { where, settings, newArrivalDays: settings.newArrivalDays ?? platform.newArrivalDays };
}

const num = (d: Prisma.Decimal | null) => (d === null ? null : Number(d));

function toItem(
  p: Prisma.ProductGetPayload<{ include: { images: true } }>,
  showPrice: boolean,
  newArrivalDays: number,
  now: Date,
): CatalogItem {
  const img = p.images.find((i) => i.status === "READY" && i.thumbUrl);
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    catalogName: p.catalogName,
    category: p.category,
    fabric: p.fabric,
    colours: p.colours,
    sizes: p.sizes,
    piecesPerSet: p.piecesPerSet,
    price: showPrice ? num(p.price) : null,
    mrp: showPrice ? num(p.mrp) : null,
    priceType: p.priceType,
    moq: p.moq,
    availableQty: Math.max(0, p.availableQty),
    isNew: isNewArrival(p, newArrivalDays, now),
    firstSeenAt: p.firstSeenAt.toISOString(),
    sheetRow: p.sheetRow,
    image: img ? { thumbUrl: img.thumbUrl!, blurDataUrl: img.blurDataUrl } : null,
  };
}

/** Every product customers may see on this link, in sheet order. */
export async function loadCatalogSnapshot(ctx: CatalogContext, now = new Date()): Promise<CatalogSnapshot> {
  const { where, settings, newArrivalDays } = await catalogWhere(ctx);
  const products = await forClient(ctx.client.id).product.findMany({
    where,
    orderBy: { sheetRow: "asc" },
    include: { images: { where: { status: "READY" }, orderBy: { position: "asc" }, take: 1 } },
  });
  return {
    items: products.map((p) => toItem(p, ctx.link.showPrice, newArrivalDays, now)),
    lowStockThreshold: settings.lowStockThreshold,
  };
}

/** One product with all its photos, or null when it isn't on this link. */
export async function loadCatalogProduct(ctx: CatalogContext, sku: string, now = new Date()): Promise<CatalogProduct | null> {
  const { where, newArrivalDays } = await catalogWhere(ctx);
  const p = await forClient(ctx.client.id).product.findFirst({
    where: { AND: [where, { sku }] },
    include: { images: { where: { status: "READY" }, orderBy: { position: "asc" } } },
  });
  if (!p) return null;
  return {
    ...toItem(p, ctx.link.showPrice, newArrivalDays, now),
    description: p.description,
    videoUrl: p.videoUrl,
    gstPct: num(p.gstPct),
    tags: p.tags,
    images: p.images
      .filter((i) => i.thumbUrl && i.fullUrl)
      .map((i) => ({ thumbUrl: i.thumbUrl!, fullUrl: i.fullUrl!, blurDataUrl: i.blurDataUrl })),
  };
}

// ───────────────────────────── Filters ─────────────────────────────

export const CATALOG_SORTS = { default: "Featured", new: "Newest first", price_asc: "Price: low to high", price_desc: "Price: high to low" } as const;
export type CatalogSort = keyof typeof CATALOG_SORTS;

export type CatalogFilters = {
  q?: string;
  category?: string;
  catalog?: string;
  fabric?: string;
  colour?: string;
  min?: number;
  max?: number;
  newOnly?: boolean;
  inStock?: boolean;
  sort: CatalogSort;
};

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function param(sp: Params, key: string) {
  const v = sp instanceof URLSearchParams ? sp.get(key) : sp[key];
  const s = (Array.isArray(v) ? v[0] : v)?.trim();
  return s ? s.slice(0, 100) : undefined;
}

function amount(v: string | undefined) {
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Filters from URL search params (shared links keep the filtered view). */
export function parseCatalogFilters(sp: Params): CatalogFilters {
  const sort = param(sp, "sort");
  return {
    q: param(sp, "q"),
    category: param(sp, "category"),
    catalog: param(sp, "catalog"),
    fabric: param(sp, "fabric"),
    colour: param(sp, "colour"),
    min: amount(param(sp, "min")),
    max: amount(param(sp, "max")),
    newOnly: param(sp, "new") === "1",
    inStock: param(sp, "stock") === "1",
    sort: sort && sort in CATALOG_SORTS ? (sort as CatalogSort) : "default",
  };
}

/** The filters as URL params (empty ones left out), e.g. for "load more" requests and links. */
export function catalogFilterParams(f: CatalogFilters, omit: (keyof CatalogFilters)[] = []) {
  const s = new URLSearchParams();
  const set = (key: string, field: keyof CatalogFilters, value: string | undefined) => {
    if (value && !omit.includes(field)) s.set(key, value);
  };
  set("q", "q", f.q);
  set("category", "category", f.category);
  set("catalog", "catalog", f.catalog);
  set("fabric", "fabric", f.fabric);
  set("colour", "colour", f.colour);
  set("min", "min", f.min?.toString());
  set("max", "max", f.max?.toString());
  set("new", "newOnly", f.newOnly ? "1" : undefined);
  set("stock", "inStock", f.inStock ? "1" : undefined);
  set("sort", "sort", f.sort === "default" ? undefined : f.sort);
  return s;
}

const same = (a: string | null | undefined, b: string) => !!a && a.toLowerCase() === b.toLowerCase();

export function filterCatalog(items: CatalogItem[], f: CatalogFilters): CatalogItem[] {
  const q = f.q?.toLowerCase();
  const result = items.filter(
    (p) =>
      (!q || [p.name, p.sku, p.category, p.catalogName, p.fabric, ...p.colours].some((v) => v?.toLowerCase().includes(q))) &&
      (!f.category || same(p.category, f.category)) &&
      (!f.catalog || same(p.catalogName, f.catalog)) &&
      (!f.fabric || same(p.fabric, f.fabric)) &&
      (!f.colour || p.colours.some((c) => same(c, f.colour!))) &&
      // Price filters only apply when prices are shown.
      (f.min === undefined || p.price === null || p.price >= f.min) &&
      (f.max === undefined || p.price === null || p.price <= f.max) &&
      (!f.newOnly || p.isNew) &&
      (!f.inStock || p.availableQty > 0),
  );
  const byPrice = (dir: 1 | -1) => (a: CatalogItem, b: CatalogItem) => ((a.price ?? 0) - (b.price ?? 0)) * dir || a.sheetRow - b.sheetRow;
  if (f.sort === "price_asc") result.sort(byPrice(1));
  if (f.sort === "price_desc") result.sort(byPrice(-1));
  if (f.sort === "new") result.sort((a, b) => b.firstSeenAt.localeCompare(a.firstSeenAt) || a.sheetRow - b.sheetRow);
  return result;
}

export type Facet = { name: string; count: number };
export type CatalogFacets = {
  categories: Facet[];
  catalogs: (Facet & { cover: Image | null })[];
  fabrics: Facet[];
  colours: Facet[];
  price: { min: number; max: number } | null;
  newCount: number;
};

function count(values: (string | null | undefined)[]) {
  const map = new Map<string, Facet>();
  for (const v of values) {
    const name = v?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const f = map.get(key);
    if (f) f.count++;
    else map.set(key, { name, count: 1 });
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Filter options for the whole link (not narrowed by the current filters). */
export function catalogFacets(items: CatalogItem[]): CatalogFacets {
  const prices = items.map((p) => p.price).filter((p): p is number => p !== null);
  const covers = new Map<string, Image | null>();
  for (const p of items) if (p.catalogName && !covers.get(p.catalogName.toLowerCase())) covers.set(p.catalogName.toLowerCase(), p.image);
  return {
    categories: count(items.map((p) => p.category)),
    catalogs: count(items.map((p) => p.catalogName)).map((f) => ({ ...f, cover: covers.get(f.name.toLowerCase()) ?? null })),
    fabrics: count(items.map((p) => p.fabric)),
    colours: count(items.flatMap((p) => p.colours)),
    price: prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null,
    newCount: items.filter((p) => p.isNew).length,
  };
}

/** One page of results; `cursor` is the offset of the first item. */
export function pageCatalog(items: CatalogItem[], cursor = 0, size = CATALOG_PAGE_SIZE) {
  const start = Math.max(0, Math.floor(cursor));
  const page = items.slice(start, start + size);
  return { items: page, nextCursor: start + size < items.length ? start + size : null, total: items.length };
}

// ───────────────────────────── Sharing ─────────────────────────────

/** wa.me link to the seller (Indian numbers get the 91 country code). */
export function sellerWhatsappUrl(mobile: string, text?: string) {
  const digits = mobile.replace(/\D/g, "");
  const full = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${full}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export function telUrl(mobile: string) {
  const digits = mobile.replace(/\D/g, "");
  return `tel:${digits.length === 10 ? `+91${digits}` : `+${digits}`}`;
}
