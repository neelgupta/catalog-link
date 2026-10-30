import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize, resolve, sep } from "node:path";

/** Where uploaded/generated files live. Swap for S3 later without changing callers. */
export interface Storage {
  save(key: string, data: Buffer): Promise<string>;
  read(key: string): Promise<Buffer | null>;
  remove(key: string): Promise<void>;
  /** Public URL path for a key. */
  url(key: string): string;
  /** Key for a URL produced by `url()`, or null when the URL isn't ours. */
  keyFromUrl(url: string): string | null;
}

export const MEDIA_URL_PREFIX = "/media/";

/** Files on local disk under MEDIA_DIR, served by the web app at /media/<key>. */
export class LocalStorage implements Storage {
  constructor(private readonly root: string) {}

  private path(key: string) {
    const clean = normalize(key).replace(/^([/\\])+/, "");
    const full = resolve(this.root, clean);
    if (!full.startsWith(resolve(this.root) + sep)) throw new Error(`Invalid storage key: ${key}`);
    return full;
  }

  async save(key: string, data: Buffer) {
    const full = this.path(key);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, data);
    return this.url(key);
  }

  async read(key: string) {
    try {
      return await readFile(this.path(key));
    } catch {
      return null;
    }
  }

  /** Removes a file, or a whole folder of files (e.g. `clients/<id>`). */
  async remove(key: string) {
    await rm(this.path(key), { force: true, recursive: true });
  }

  url(key: string) {
    return MEDIA_URL_PREFIX + key.split("/").map(encodeURIComponent).join("/");
  }

  keyFromUrl(url: string) {
    if (!url.startsWith(MEDIA_URL_PREFIX)) return null;
    return url.slice(MEDIA_URL_PREFIX.length).split("/").map(decodeURIComponent).join("/");
  }
}

let storage: Storage | undefined;

export function getStorage(): Storage {
  storage ??= new LocalStorage(process.env.MEDIA_DIR ?? join(process.cwd(), "media"));
  return storage;
}

// ───────────────────────── Upload checks ─────────────────────────

export type ImageKind = { ext: "png" | "jpg" | "webp"; contentType: string };

/** Detects PNG/JPEG/WebP from the file's first bytes (the browser-sent type isn't trusted). */
export function sniffImage(data: Buffer): ImageKind | null {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return { ext: "png", contentType: "image/png" };
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff)
    return { ext: "jpg", contentType: "image/jpeg" };
  if (data.length >= 12 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP")
    return { ext: "webp", contentType: "image/webp" };
  return null;
}

/** .xlsx files are ZIP archives. */
export function isZip(data: Buffer) {
  return data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04;
}

export const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
