"use server";

import { verifyPassword } from "@cataloglink/core/password";
import { LIMITS, rateLimit } from "@cataloglink/core/ratelimit";
import { prisma } from "@cataloglink/db";
import { passwordLoginSchema } from "@cataloglink/validation";
import { redirect } from "next/navigation";
import { endStaffSession, homeFor, startStaffSession } from "@/lib/auth";
import { clientIp } from "@/lib/request";

export type LoginState = { error?: string; email?: string };

/** Only allow redirects to local paths (prevents open redirects via ?next=). */
function safeNext(next: FormDataEntryValue | null, fallback: string) {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

export async function passwordLogin(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = passwordLoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, email };

  const limited = await rateLimit(
    `login:ip:${await clientIp()}`,
    LIMITS.loginPerIp.limit,
    LIMITS.loginPerIp.windowSec,
  );
  if (!limited.ok) return { error: "Too many login attempts. Please try again in a few minutes.", email };

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, role: true, clientId: true, isActive: true, passwordHash: true },
  });
  const valid = user?.isActive && (await verifyPassword(user.passwordHash, parsed.data.password));
  if (!user || !valid) return { error: "Incorrect email or password.", email };
  if (user.role === "CLIENT_OWNER" && !user.clientId) return { error: "This account is not linked to a business.", email };

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await startStaffSession({ userId: user.id, role: user.role, clientId: user.clientId ?? undefined });

  const home = homeFor(user.role);
  const next = safeNext(formData.get("next"), home);
  // Don't send a client to /admin (or an admin to /app) just because of a stale ?next=.
  redirect(next.startsWith(home) ? next : home);
}

export async function logout() {
  await endStaffSession();
  redirect("/login");
}
