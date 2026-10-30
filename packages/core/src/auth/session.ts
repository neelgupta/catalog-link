import { jwtVerify, SignJWT } from "jose";

/** Session for Super Admin and client users (cookie `cl_session`). */
export type StaffSession = {
  kind: "staff";
  userId: string;
  role: "SUPER_ADMIN" | "CLIENT_OWNER";
  clientId?: string;
  /** Set when a Super Admin is impersonating a client: the admin's user id. */
  imp?: string;
};

/** Session for a customer on one client's catalog (cookie `cl_cust_<clientId>`). */
export type CustomerSession = {
  kind: "customer";
  clientId: string;
  mobile: string;
  customerId?: string;
};

export type Session = StaffSession | CustomerSession;

export const STAFF_COOKIE = "cl_session";
export const customerCookieName = (clientId: string) => `cl_cust_${clientId}`;

export const STAFF_SESSION_TTL_SEC = 7 * 24 * 60 * 60;
export const CUSTOMER_SESSION_TTL_SEC = 30 * 24 * 60 * 60;

const ISSUER = "cataloglink";
const key = (secret: string) => new TextEncoder().encode(secret);

export async function signSession(session: Session, secret: string, ttlSec: number): Promise<string> {
  const { kind, ...claims } = session;
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(kind)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSec)
    .sign(key(secret));
}

export async function verifyStaffSession(token: string | undefined, secret: string) {
  return verify<StaffSession>(token, secret, "staff");
}

export async function verifyCustomerSession(
  token: string | undefined,
  secret: string,
  clientId: string,
): Promise<CustomerSession | null> {
  const session = await verify<CustomerSession>(token, secret, "customer");
  return session && session.clientId === clientId ? session : null;
}

async function verify<T extends Session>(
  token: string | undefined,
  secret: string,
  kind: T["kind"],
): Promise<T | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), { issuer: ISSUER, audience: kind });
    const { iss: _iss, aud: _aud, iat: _iat, exp: _exp, ...claims } = payload;
    return { kind, ...claims } as T;
  } catch {
    return null;
  }
}
