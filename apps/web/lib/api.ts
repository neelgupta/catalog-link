import { NextResponse } from "next/server";
import type { ZodError } from "zod";

/** Standard error body for all route handlers: { error: { code, message, details? } }. */
export function apiError(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, { status });
}

export function validationError(error: ZodError) {
  return apiError(
    422,
    "VALIDATION_ERROR",
    error.issues[0]?.message ?? "Invalid input",
    error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  );
}

export function tooManyRequests(retryAfterSec: number) {
  const res = apiError(429, "RATE_LIMITED", "Too many attempts. Please try again later.");
  res.headers.set("Retry-After", String(retryAfterSec));
  return res;
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

/**
 * Cross-site request guard for cookie-authenticated POSTs: browsers can't send a JSON body to another
 * origin without a CORS preflight, which we never allow, and the Origin header must match when present.
 */
export function crossSiteBlocked(request: Request) {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) return apiError(415, "UNSUPPORTED_MEDIA_TYPE", "Send JSON");
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return apiError(403, "FORBIDDEN", "Cross-site request");
  return null;
}
