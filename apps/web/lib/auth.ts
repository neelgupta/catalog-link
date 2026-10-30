// Server-only session helpers. These guards are the security boundary: every page, server action
// and route handler that touches protected data calls one of them (proxy.ts only redirects early).
import { getEnv } from "@cataloglink/core/env";
import {
  CUSTOMER_SESSION_TTL_SEC,
  customerCookieName,
  signSession,
  STAFF_COOKIE,
  STAFF_SESSION_TTL_SEC,
  verifyCustomerSession,
  verifyStaffSession,
  type CustomerSession,
  type StaffSession,
} from "@cataloglink/core/session";
import { prisma } from "@cataloglink/db";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});

export const getStaffSession = cache(async (): Promise<StaffSession | null> => {
  const token = (await cookies()).get(STAFF_COOKIE)?.value;
  return verifyStaffSession(token, getEnv().SESSION_SECRET);
});

export async function startStaffSession(session: Omit<StaffSession, "kind">) {
  const token = await signSession({ kind: "staff", ...session }, getEnv().SESSION_SECRET, STAFF_SESSION_TTL_SEC);
  (await cookies()).set(STAFF_COOKIE, token, cookieOptions(STAFF_SESSION_TTL_SEC));
}

export async function endStaffSession() {
  (await cookies()).delete(STAFF_COOKIE);
}

/** Loads the session user and checks they still exist and are active. */
const getActiveStaffUser = cache(async () => {
  const session = await getStaffSession();
  if (!session) return null;
  // While impersonating, the acting user is the Super Admin in `imp`.
  const user = await prisma.user.findUnique({
    where: { id: session.imp ?? session.userId },
    select: { id: true, role: true, clientId: true, isActive: true },
  });
  if (!user?.isActive) return null;
  return { session, user };
});

export async function requireSuperAdmin() {
  const active = await getActiveStaffUser();
  if (!active || active.session.imp || active.user.role !== "SUPER_ADMIN") redirect("/login");
  return { userId: active.user.id };
}

export async function requireClient() {
  const active = await getActiveStaffUser();
  if (!active) redirect("/login");
  const { session, user } = active;

  if (session.imp) {
    // Super Admin acting as a client.
    if (user.role !== "SUPER_ADMIN" || !session.clientId) redirect("/login");
    return { userId: session.userId, clientId: session.clientId, impersonatedBy: user.id };
  }
  if (user.role === "SUPER_ADMIN") redirect("/admin");
  if (user.role !== "CLIENT_OWNER" || !user.clientId) redirect("/login");
  return { userId: user.id, clientId: user.clientId, impersonatedBy: undefined };
}

export async function getCustomerSession(clientId: string): Promise<CustomerSession | null> {
  const token = (await cookies()).get(customerCookieName(clientId))?.value;
  return verifyCustomerSession(token, getEnv().SESSION_SECRET, clientId);
}

/** For customer-only route handlers: returns the session or null (caller responds 401). */
export async function requireCustomer(clientId: string) {
  return getCustomerSession(clientId);
}

export async function startCustomerSession(session: Omit<CustomerSession, "kind">) {
  const token = await signSession(
    { kind: "customer", ...session },
    getEnv().SESSION_SECRET,
    CUSTOMER_SESSION_TTL_SEC,
  );
  (await cookies()).set(customerCookieName(session.clientId), token, cookieOptions(CUSTOMER_SESSION_TTL_SEC));
}

export function homeFor(role: StaffSession["role"]) {
  return role === "SUPER_ADMIN" ? "/admin" : "/app";
}
