import { headers } from "next/headers";

/** Best-effort client IP for rate limiting (first X-Forwarded-For hop, set by the reverse proxy). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}
