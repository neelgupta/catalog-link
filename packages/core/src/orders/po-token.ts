// The customer's private link to one order's PO slip. Customers don't verify their mobile when
// ordering (for now), so access is by this signed token for a single order, not by mobile number.
import { jwtVerify, SignJWT } from "jose";

const AUDIENCE = "po";
const TTL_SEC = 365 * 24 * 60 * 60;
const key = (secret: string) => new TextEncoder().encode(secret);

export async function signPoToken(orderId: string, clientId: string, secret: string) {
  return new SignJWT({ cid: clientId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(orderId)
    .setAudience(AUDIENCE)
    .setIssuer("cataloglink")
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + TTL_SEC)
    .sign(key(secret));
}

/** The order id the token grants, if it's valid and for this client; otherwise null. */
export async function verifyPoToken(token: string, clientId: string, secret: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { audience: AUDIENCE, issuer: "cataloglink" });
    return payload.cid === clientId && typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
