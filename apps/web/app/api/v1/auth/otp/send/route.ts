import { getOtpService } from "@cataloglink/core/otp";
import { LIMITS, rateLimit } from "@cataloglink/core/ratelimit";
import { prisma } from "@cataloglink/db";
import { otpSendSchema } from "@cataloglink/validation";
import { NextResponse } from "next/server";
import { apiError, readJson, tooManyRequests, validationError } from "@/lib/api";
import { clientIp } from "@/lib/request";

/** Client login: send an OTP to a registered client owner's mobile. */
export async function POST(request: Request) {
  const parsed = otpSendSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);
  const { mobile } = parsed.data;

  const ip = await clientIp();
  const byIp = await rateLimit(`otp:ip:${ip}`, LIMITS.otpSendPerIp.limit, LIMITS.otpSendPerIp.windowSec);
  if (!byIp.ok) return tooManyRequests(byIp.retryAfterSec);
  const byMobile = await rateLimit(
    `otp:login:${mobile}`,
    LIMITS.otpSendPerMobile.limit,
    LIMITS.otpSendPerMobile.windowSec,
  );
  if (!byMobile.ok) return tooManyRequests(byMobile.retryAfterSec);

  const user = await prisma.user.findFirst({
    where: { mobile, role: "CLIENT_OWNER", isActive: true },
    select: { id: true },
  });

  // Same response whether or not the number is registered, so numbers can't be probed.
  if (user) {
    try {
      await getOtpService().send(mobile, "CLIENT_LOGIN");
    } catch (err) {
      console.error("[otp] send failed", err);
      return apiError(502, "OTP_SEND_FAILED", "Could not send the OTP. Please try again.");
    }
  }
  return NextResponse.json({ ok: true });
}
