import { Prisma, prisma, type SyncTrigger } from "@cataloglink/db";
import type { GoogleSource } from "../google/source";
import { GOOGLE_ERROR_MESSAGES, GoogleError, toGoogleError } from "../google/source";
import type { ImageRef } from "../google/links";
import { DomainError } from "../errors";
import { getStorage } from "../storage";
import { getCurrentSubscription } from "../subscriptions";
import { describeMissing, mapHeaders } from "./headers";
import { parseRows, type ParsedProduct, type RowError } from "./validate";

export const MAX_IMAGES_PER_PRODUCT = 20;
const WRITE_BATCH = 200;

export type SyncDeps = {
  /** The Google source, or a factory for it (its errors, e.g. missing credentials, fail the run). */
  source: GoogleSource | (() => GoogleSource);
  /** Queue thumbnail jobs for these ProductImage ids. */
  enqueueImages?: (imageIds: string[]) => Promise<void>;
  /** Called after products changed, e.g. to refresh the cached catalog pages. */
  onCatalogChanged?: (clientId: string) => Promise<void>;
  now?: () => Date;
};

export type SyncResult = {
  runId: string | null;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  message?: string;
  /** Failure that will likely go away on its own (rate limit, Google outage). */
  transient?: boolean;
};

type DesiredImage = { driveFileId: string | null; externalUrl: string | null };

class SyncAbort extends Error {}

/**
 * Reads the client's sheet and brings their products in line with it. Google is read completely
 * before anything is written, so a Google error never deletes, hides or half-updates products.
 */
export async function runSync(clientId: string, trigger: SyncTrigger, deps: SyncDeps): Promise<SyncResult> {
  const now = deps.now ?? (() => new Date());
  const connection = await prisma.sheetConnection.findUnique({ where: { clientId } });
  if (!connection?.spreadsheetId || !connection.sheetName) {
    return { runId: null, status: "FAILED", message: "No Google Sheet is connected" };
  }

  const run = await prisma.syncRun.create({ data: { clientId, trigger, status: "RUNNING", startedAt: now() } });
  await prisma.sheetConnection.update({ where: { clientId }, data: { lastStatus: "RUNNING" } });

  const fail = async (message: string, transient = false): Promise<SyncResult> => {
    await prisma.$transaction([
      prisma.syncRun.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: now(), errorMessage: message } }),
      prisma.sheetConnection.update({ where: { clientId }, data: { lastStatus: "FAILED", lastSyncedAt: now() } }),
    ]);
    return { runId: run.id, status: "FAILED", message, transient };
  };

  try {
    const subscription = await getCurrentSubscription(clientId);
    if (!subscription || subscription.expiresAt <= now()) throw new SyncAbort("No active plan. Ask CatalogLink support to renew your plan.");

    // ── 1. Read Google ────────────────────────────────────────────────
    const source = typeof deps.source === "function" ? deps.source() : deps.source;
    const values = await source.readValues(connection.spreadsheetId, connection.sheetName);
    const { map, missing } = mapHeaders(values[0] ?? []);
    if (!values.length) throw new SyncAbort("The sheet is empty. Add a header row and products.");
    if (missing.length) throw new SyncAbort(`Missing column(s): ${describeMissing(missing)}. Use the template's column names.`);

    const parsed = parseRows(values.slice(1), map, subscription.plan.maxProducts);
    const errors: RowError[] = [...parsed.errors];

    const existing = await prisma.product.findMany({
      where: { clientId },
      select: { id: true, sku: true, rowHash: true, sheetRow: true, removedFromSheetAt: true },
    });
    const bySku = new Map(existing.map((p) => [p.sku, p]));

    const created = parsed.products.filter((p) => !bySku.has(p.sku));
    const contentChanged = parsed.products.filter((p) => {
      const old = bySku.get(p.sku);
      return old && old.rowHash !== p.rowHash;
    });
    const metaOnly = parsed.products.filter((p) => {
      const old = bySku.get(p.sku);
      return old && old.rowHash === p.rowHash && (old.sheetRow !== p.sheetRow || old.removedFromSheetAt);
    });

    // Folder contents can change without the row changing: a manual sync re-reads folders too.
    const refreshImages = [...created, ...contentChanged];
    if (trigger === "MANUAL") {
      const seen = new Set(refreshImages.map((p) => p.sku));
      refreshImages.push(...parsed.products.filter((p) => !seen.has(p.sku) && p.imageRefs.some((r) => r.kind === "folder")));
    }
    const desiredImages = await resolveImages(refreshImages, source, errors);

    // ── 2. Write ──────────────────────────────────────────────────────
    // SKUs whose row is present but invalid keep their last good data; rows over the plan limit don't.
    const keep = new Set(parsed.products.map((p) => p.sku));
    for (const e of errors) if (e.skipped && e.sku && e.code !== "PLAN_LIMIT") keep.add(e.sku);
    const removed = existing.filter((p) => !keep.has(p.sku) && !p.removedFromSheetAt).map((p) => p.id);

    const productIds = new Map(existing.map((p) => [p.sku, p.id]));
    for (const batch of chunks(created, WRITE_BATCH)) {
      const rows = await prisma.product.createManyAndReturn({
        data: batch.map((p) => ({ clientId, ...productData(p), firstSeenAt: now() })),
        select: { id: true, sku: true },
      });
      for (const r of rows) productIds.set(r.sku, r.id);
    }
    for (const batch of chunks([...contentChanged, ...metaOnly], WRITE_BATCH)) {
      await prisma.$transaction(
        batch.map((p) =>
          prisma.product.update({
            where: { id: productIds.get(p.sku)! },
            data: { ...productData(p), removedFromSheetAt: null },
          }),
        ),
      );
    }
    if (removed.length) {
      await prisma.product.updateMany({ where: { id: { in: removed } }, data: { removedFromSheetAt: now() } });
    }

    const filesToRemove: string[] = [];
    for (const batch of chunks([...desiredImages.entries()], WRITE_BATCH)) {
      await prisma.$transaction(async (tx) => {
        for (const [sku, images] of batch) {
          filesToRemove.push(...(await syncProductImages(tx, clientId, productIds.get(sku)!, images)));
        }
      });
    }

    const status = errors.length ? "PARTIAL" : "SUCCESS";
    await prisma.$transaction([
      prisma.syncRowError.createMany({
        data: errors.slice(0, 1000).map((e) => ({ clientId, syncRunId: run.id, rowNumber: e.rowNumber, sku: e.sku, code: e.code, message: e.message })),
      }),
      prisma.syncRun.update({
        where: { id: run.id },
        data: {
          status,
          finishedAt: now(),
          rowsTotal: parsed.dataRows,
          rowsAdded: created.length,
          rowsUpdated: contentChanged.length,
          rowsSkipped: parsed.skipped,
          rowsRemoved: removed.length,
        },
      }),
      prisma.sheetConnection.update({
        where: { clientId },
        data: { lastStatus: status, lastSyncedAt: now(), headerMap: map as Prisma.InputJsonValue },
      }),
    ]);

    await Promise.all(filesToRemove.map((url) => removeMedia(url)));
    const pending = await prisma.productImage.findMany({ where: { clientId, status: "PENDING" }, select: { id: true } });
    if (pending.length) await deps.enqueueImages?.(pending.map((i) => i.id));
    if (created.length || contentChanged.length || metaOnly.length || removed.length) await deps.onCatalogChanged?.(clientId);

    return { runId: run.id, status };
  } catch (err) {
    if (err instanceof SyncAbort || err instanceof DomainError) return fail(err.message);
    if (err instanceof GoogleError || isGoogleLike(err)) {
      const g = toGoogleError(err);
      return fail(g.kind === "unknown" ? g.message : GOOGLE_ERROR_MESSAGES[g.kind], g.transient);
    }
    await fail("Unexpected error during sync. Support has been notified.");
    throw err;
  }
}

function isGoogleLike(err: unknown) {
  return typeof err === "object" && err !== null && ("response" in err || "status" in err) && !(err instanceof Prisma.PrismaClientKnownRequestError);
}

function productData(p: ParsedProduct) {
  return {
    sku: p.sku,
    name: p.name,
    catalogName: p.catalogName,
    category: p.category,
    fabric: p.fabric,
    colours: p.colours,
    sizes: p.sizes,
    piecesPerSet: p.piecesPerSet,
    price: p.price,
    mrp: p.mrp,
    priceType: p.priceType,
    moq: p.moq,
    availableQty: p.availableQty,
    videoUrl: p.videoUrl,
    description: p.description,
    gstPct: p.gstPct,
    sheetActive: p.sheetActive,
    tags: p.tags,
    rowHash: p.rowHash,
    sheetRow: p.sheetRow,
  };
}

/**
 * Expands each product's image refs into concrete images. Folder listings are cached per run.
 * An inaccessible folder becomes a row warning; a transient Google error aborts the sync.
 */
async function resolveImages(products: ParsedProduct[], source: GoogleSource, errors: RowError[]) {
  const folderCache = new Map<string, string[] | GoogleError>();
  const result = new Map<string, DesiredImage[]>();

  for (const p of products) {
    const images: DesiredImage[] = [];
    for (const ref of p.imageRefs) {
      for (const img of await expand(ref)) {
        if (images.length < MAX_IMAGES_PER_PRODUCT) images.push(img);
      }
      if (ref.kind === "folder" && folderCache.get(ref.id) instanceof GoogleError) {
        errors.push({ rowNumber: p.sheetRow, sku: p.sku, code: "BAD_IMAGE_LINK", message: `Image folder couldn't be opened: ${(folderCache.get(ref.id) as GoogleError).message}`, skipped: false });
      } else if (ref.kind === "folder" && (folderCache.get(ref.id) as string[]).length === 0) {
        errors.push({ rowNumber: p.sheetRow, sku: p.sku, code: "BAD_IMAGE_LINK", message: "Image folder has no images", skipped: false });
      }
    }
    result.set(p.sku, images);
  }
  return result;

  async function expand(ref: ImageRef): Promise<DesiredImage[]> {
    if (ref.kind === "file") return [{ driveFileId: ref.id, externalUrl: null }];
    if (ref.kind === "url") return [{ driveFileId: null, externalUrl: ref.url }];
    if (!folderCache.has(ref.id)) {
      try {
        folderCache.set(ref.id, (await source.listFolderImages(ref.id)).map((f) => f.id));
      } catch (err) {
        const g = toGoogleError(err);
        if (g.transient || g.kind === "auth") throw g;
        folderCache.set(ref.id, g);
      }
    }
    const cached = folderCache.get(ref.id)!;
    return cached instanceof GoogleError ? [] : cached.map((id) => ({ driveFileId: id, externalUrl: null }));
  }
}

/** Reconciles a product's image rows with the desired list. Returns stored file URLs to delete. */
async function syncProductImages(tx: Prisma.TransactionClient, clientId: string, productId: string, desired: DesiredImage[]) {
  const current = await tx.productImage.findMany({ where: { productId }, orderBy: { position: "asc" } });
  const unused = [...current];
  for (const [position, want] of desired.entries()) {
    const idx = unused.findIndex((c) => c.driveFileId === want.driveFileId && c.externalUrl === want.externalUrl);
    if (idx >= 0) {
      const [match] = unused.splice(idx, 1);
      if (match!.position !== position) await tx.productImage.update({ where: { id: match!.id }, data: { position } });
    } else {
      await tx.productImage.create({
        data: { clientId, productId, position, driveFileId: want.driveFileId, externalUrl: want.externalUrl, status: "PENDING" },
      });
    }
  }
  if (unused.length) await tx.productImage.deleteMany({ where: { id: { in: unused.map((u) => u.id) } } });
  return unused.flatMap((u) => [u.thumbUrl, u.fullUrl]).filter((u): u is string => !!u && u.startsWith("/media/"));
}

async function removeMedia(url: string) {
  const key = getStorage().keyFromUrl(url);
  if (key) await getStorage().remove(key).catch(() => undefined);
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
