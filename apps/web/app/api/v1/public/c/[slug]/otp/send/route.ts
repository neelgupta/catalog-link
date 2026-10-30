import { OTP_LOGIN_ENABLED } from "@cataloglink/core/features";
import { getOtpService } from "@cataloglink/core/otp";
import { LIMITS, rateLimit } from "@cataloglink/core/ratelimit";
import { otpSendSchema } from "@cataloglink/validation";
import { NextResponse } from "next/server";
import { apiError, crossSiteBlocked, otpOff, readJson, tooManyRequests, validationError } from "@/lib/api";
import { getCatalogContext } from "@/lib/catalog";
import { clientIp } from "@/lib/request";

/** Customer login on a catalog link (checkout, "My orders"): send an OTP to any mobile. */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!OTP_LOGIN_ENABLED) return otpOff();
  const blocked = crossSiteBlocked(request);
  if (blocked) return blocked;
  const ctx = await getCatalogContext((await params).slug);
  if (!ctx) return apiError(404, "CATALOG_NOT_AVAILABLE", "This catalog link is not active");
  const parsed = otpSendSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);
  const { mobile } = parsed.data;

  const byIp = await rateLimit(`otp:ip:${await clientIp()}`, LIMITS.otpSendPerIp.limit, LIMITS.otpSendPerIp.windowSec);
  if (!byIp.ok) return tooManyRequests(byIp.retryAfterSec);
  const byMobile = await rateLimit(`otp:cust:${ctx.client.id}:${mobile}`, LIMITS.otpSendPerMobile.limit, LIMITS.otpSendPerMobile.windowSec);
  if (!byMobile.ok) return tooManyRequests(byMobile.retryAfterSec);

  try {
    await getOtpService().send(mobile, "CUSTOMER", ctx.client.id);
  } catch (err) {
    console.error("[otp] customer send failed", err);
    return apiError(502, "OTP_SEND_FAILED", "Could not send the OTP. Please try again.");
  }
  return NextResponse.json({ ok: true });
}
