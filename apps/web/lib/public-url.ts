import { getEnv } from "@cataloglink/core/env";
import { headers } from "next/headers";

/**
 * Base URL for links people copy, share or scan (catalog links, QR codes, WhatsApp texts).
 * Production: always APP_URL. Development: the address the page was opened on, so a link copied on a
 * phone that opened the dev server at http://192.168.x.x:3000 also opens on that phone
 * (APP_URL is usually http://localhost:3000, which on a phone means the phone itself).
 */
export async function publicBaseUrl() {
  const appUrl = getEnv().APP_URL.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") return appUrl;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host || !/^[\w.-]+(:\d{1,5})?$/.test(host)) return appUrl;
  const proto = h.get("x-forwarded-proto") === "https" ? "https" : "http";
  return `${proto}://${host}`;
}
