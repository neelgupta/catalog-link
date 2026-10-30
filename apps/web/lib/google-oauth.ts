import { randomBytes, timingSafeEqual } from "node:crypto";
import { getEnv } from "@cataloglink/core/env";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";

// The OAuth `state` is a short-lived signed token bound to the client and to a nonce cookie,
// so a callback can't be replayed or forged into another client's account.
const NONCE_COOKIE = "cl_google_oauth";
const TTL_SEC = 10 * 60;
const key = () => new TextEncoder().encode(getEnv().SESSION_SECRET);

export async function createOAuthState(clientId: string, userId: string) {
  const nonce = randomBytes(16).toString("hex");
  (await cookies()).set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // sent on the top-level redirect back from Google
    path: "/api/v1/google",
    maxAge: TTL_SEC,
  });
  return new SignJWT({ clientId, userId, nonce })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("google-oauth")
    .setExpirationTime(Math.floor(Date.now() / 1000) + TTL_SEC)
    .sign(key());
}

/** Returns the clientId the state was issued for, or null when invalid, expired or replayed. */
export async function consumeOAuthState(state: string | null, clientId: string) {
  const jar = await cookies();
  const nonce = jar.get(NONCE_COOKIE)?.value;
  jar.delete({ name: NONCE_COOKIE, path: "/api/v1/google" });
  if (!state || !nonce) return null;
  try {
    const { payload } = await jwtVerify(state, key(), { audience: "google-oauth" });
    const a = Buffer.from(String(payload.nonce));
    const b = Buffer.from(nonce);
    if (a.length !== b.length || !timingSafeEqual(a, b) || payload.clientId !== clientId) return null;
    return payload.clientId as string;
  } catch {
    return null;
  }
}
