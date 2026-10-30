import { createHash } from "node:crypto";
import { prisma } from "@cataloglink/db";
import sharp from "sharp";
import { MAX_IMAGE_BYTES } from "../google/api-source";
import { type GoogleSource, GoogleError, toGoogleError } from "../google/source";
import { DomainError } from "../errors";
import { getStorage } from "../storage";

export const THUMB_WIDTH = 400;
export const FULL_WIDTH = 1200;

export type ProcessResult = "ready" | "skipped" | "failed" | "missing";

/** Builds the 400px and 1200px WebP versions plus a tiny blur placeholder. */
export async function makeVariants(input: Buffer) {
  const base = sharp(input, { failOn: "error", limitInputPixels: 50_000_000 }).rotate();
  const [thumb, full, blur] = await Promise.all([
    base.clone().resize({ width: THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: 75 }).toBuffer(),
    base.clone().resize({ width: FULL_WIDTH, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer(),
    base.clone().resize({ width: 16 }).webp({ quality: 40 }).toBuffer(),
  ]);
  return { thumb, full, blurDataUrl: `data:image/webp;base64,${blur.toString("base64")}` };
}

/**
 * Processes one ProductImage: downloads the Drive file and stores thumbnails. Skips work when the
 * Drive file hasn't changed since the last successful run. Transient Google errors are rethrown so
 * the queue retries; anything else marks the image FAILED with a readable reason.
 */
export async function processImage(imageId: string, sourceOrFactory: GoogleSource | (() => GoogleSource)): Promise<ProcessResult> {
  const image = await prisma.productImage.findUnique({ where: { id: imageId } });
  if (!image) return "missing";

  if (image.externalUrl) {
    // Plain https image links are shown as-is (not cached).
    await prisma.productImage.update({
      where: { id: imageId },
      data: { status: "READY", thumbUrl: image.externalUrl, fullUrl: image.externalUrl, error: null },
    });
    return "ready";
  }

  const fail = async (error: string) => {
    await prisma.productImage.update({ where: { id: imageId }, data: { status: "FAILED", error } });
    return "failed" as const;
  };

  try {
    const source = typeof sourceOrFactory === "function" ? sourceOrFactory() : sourceOrFactory;
    const meta = await source.getFile(image.driveFileId!);
    const modified = meta.modifiedTime ? new Date(meta.modifiedTime) : null;
    if (image.status === "READY" && modified && image.driveModifiedAt?.getTime() === modified.getTime()) return "skipped";
    if (!meta.mimeType.startsWith("image/")) return fail(`"${meta.name}" is not an image (${meta.mimeType || "unknown type"})`);
    if (meta.size && meta.size > MAX_IMAGE_BYTES) return fail(`"${meta.name}" is larger than 20 MB`);

    let variants;
    try {
      variants = await makeVariants(await source.download(image.driveFileId!));
    } catch (err) {
      if (err instanceof GoogleError) throw err;
      return fail(`"${meta.name}" could not be read as an image`);
    }

    // Version the file name so browsers and CDNs never serve an old picture from cache.
    const version = createHash("sha1").update(meta.modifiedTime ?? String(Date.now())).digest("hex").slice(0, 8);
    const prefix = `clients/${image.clientId}/images/${image.id}-${version}`;
    const storage = getStorage();
    const [thumbUrl, fullUrl] = await Promise.all([
      storage.save(`${prefix}-${THUMB_WIDTH}.webp`, variants.thumb),
      storage.save(`${prefix}-${FULL_WIDTH}.webp`, variants.full),
    ]);

    await prisma.productImage.update({
      where: { id: imageId },
      data: { status: "READY", thumbUrl, fullUrl, blurDataUrl: variants.blurDataUrl, driveModifiedAt: modified, error: null },
    });
    for (const old of [image.thumbUrl, image.fullUrl]) {
      const key = old && old !== thumbUrl && old !== fullUrl ? storage.keyFromUrl(old) : null;
      if (key) await storage.remove(key).catch(() => undefined);
    }
    return "ready";
  } catch (err) {
    if (err instanceof DomainError) return fail(err.message);
    const g = toGoogleError(err);
    if (g.transient) throw g;
    if (g.kind === "not_found" || g.kind === "no_access") {
      return fail("Image not accessible. Set the Drive file to \"Anyone with the link\" or share it with CatalogLink.");
    }
    return fail(g.message);
  }
}
