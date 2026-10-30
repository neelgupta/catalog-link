import { randomBytes } from "node:crypto";

const MAX_LENGTH = 60;

/** "Shree Krishna Textiles & Sons" -> "shree-krishna-textiles-and-sons" */
export function slugify(input: string): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_LENGTH)
    .replace(/-+$/g, "");
  return slug || "catalog";
}

/** First free slug of `base`, `base-2`, `base-3`… (random suffix after 50 tries). */
export async function uniqueSlug(base: string, isTaken: (slug: string) => Promise<boolean>): Promise<string> {
  const root = slugify(base);
  for (let n = 1; n <= 50; n++) {
    const candidate = n === 1 ? root : `${root.slice(0, MAX_LENGTH - String(n).length - 1)}-${n}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  return `${root.slice(0, MAX_LENGTH - 7)}-${randomBytes(3).toString("hex")}`;
}
