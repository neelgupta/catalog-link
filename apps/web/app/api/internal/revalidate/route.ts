import { timingSafeEqual } from "node:crypto";
import { getEnv } from "@cataloglink/core/env";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { apiError, readJson } from "@/lib/api";

function secretMatches(given: string | null) {
  const expected = Buffer.from(getEnv().INTERNAL_API_SECRET);
  const actual = Buffer.from(given ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Called by the worker after a sync so catalog pages show the new products/stock immediately. */
export async function POST(request: Request) {
  if (!secretMatches(request.headers.get("x-internal-secret"))) return apiError(401, "UNAUTHORIZED", "Invalid internal secret");
  const body = (await readJson(request)) as { tags?: unknown };
  const tags = Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === "string" && /^[\w:-]{1,200}$/.test(t)) : [];
  if (!tags.length) return apiError(422, "VALIDATION_ERROR", "tags must be a non-empty array of strings");
  // Stock must not be served stale, so cached entries expire immediately.
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
  return NextResponse.json({ ok: true, revalidated: tags });
}
