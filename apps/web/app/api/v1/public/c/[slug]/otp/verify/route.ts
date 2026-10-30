import { getOtpService } from "@cataloglink/core/otp";
import { findCustomer } from "@cataloglink/core/orders";
import { rateLimit } from "@cataloglink/core/ratelimit";
import { otpVerifySchema } from "@cataloglink/validation";
import { NextResponse } from "next/server";
import { apiError, crossSiteBlocked, readJson, tooManyRequests, validationError } from "@/lib/api";
import { startCustomerSession } from "@/lib/auth";
import { getCatalogContext } from "@/lib/catalog";
import { clientIp } from "@/lib/request";

const MESSAGES = {
  invalid: "Incorrect OTP. Please check and try again.",
  expired: "This OTP has expired. Please request a new one.",
  too_many_attempts: "Too many wrong attempts. Please request a new OTP.",
} as const;

/** Verifies the customer's OTP, starts their session with this seller and returns saved details. */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const blocked = crossSiteBlocked(request);
  if (blocked) return blocked;
  const ctx = await getCatalogContext((await params).slug);
  if (!ctx) return apiError(404, "CATALOG_NOT_AVAILABLE", "This catalog link is not active");
  const parsed = otpVerifySchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);
  const { mobile, code } = parsed.data;

  const byIp = await rateLimit(`otp:verify:ip:${await clientIp()}`, 30, 10 * 60);
  if (!byIp.ok) return tooManyRequests(byIp.retryAfterSec);

  const result = await getOtpService().verify(mobile, "CUSTOMER", code, ctx.client.id);
  if (!result.ok) return apiError(401, `OTP_${result.reason.toUpperCase()}`, MESSAGES[result.reason]);

  const customer = await findCustomer(ctx.client.id, mobile);
  await startCustomerSession({ clientId: ctx.client.id, mobile, customerId: customer?.id });
  return NextResponse.json({
    ok: true,
    mobile,
    customer: customer && { name: customer.name, shopName: customer.shopName, city: customer.city, address: customer.address, gst: customer.gst },
  });
}
