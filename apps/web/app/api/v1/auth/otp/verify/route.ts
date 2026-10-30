import { OTP_LOGIN_ENABLED } from "@cataloglink/core/features";
import { getOtpService } from "@cataloglink/core/otp";
import { prisma } from "@cataloglink/db";
import { otpVerifySchema } from "@cataloglink/validation";
import { NextResponse } from "next/server";
import { apiError, otpOff, readJson, validationError } from "@/lib/api";
import { startStaffSession } from "@/lib/auth";

const MESSAGES = {
  invalid: "Incorrect OTP. Please check and try again.",
  expired: "This OTP has expired. Please request a new one.",
  too_many_attempts: "Too many wrong attempts. Please request a new OTP.",
} as const;

/** Client login: verify the OTP and start a session. */
export async function POST(request: Request) {
  if (!OTP_LOGIN_ENABLED) return otpOff();
  const parsed = otpVerifySchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);
  const { mobile, code } = parsed.data;

  const result = await getOtpService().verify(mobile, "CLIENT_LOGIN", code);
  if (!result.ok) return apiError(401, `OTP_${result.reason.toUpperCase()}`, MESSAGES[result.reason]);

  const user = await prisma.user.findFirst({
    where: { mobile, role: "CLIENT_OWNER", isActive: true },
    select: { id: true, clientId: true },
  });
  if (!user?.clientId) return apiError(401, "OTP_INVALID", MESSAGES.invalid);

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await startStaffSession({ userId: user.id, role: "CLIENT_OWNER", clientId: user.clientId });
  return NextResponse.json({ ok: true, redirectTo: "/app" });
}
