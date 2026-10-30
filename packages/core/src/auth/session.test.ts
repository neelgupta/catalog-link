import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";
import { signSession, verifyCustomerSession, verifyStaffSession } from "./session";

const SECRET = "x".repeat(32);

describe("sessions", () => {
  it("round-trips a staff session", async () => {
    const token = await signSession(
      { kind: "staff", userId: "u1", role: "CLIENT_OWNER", clientId: "c1" },
      SECRET,
      60,
    );
    expect(await verifyStaffSession(token, SECRET)).toEqual({
      kind: "staff",
      userId: "u1",
      role: "CLIENT_OWNER",
      clientId: "c1",
    });
  });

  it("rejects a wrong secret, a tampered token and an expired token", async () => {
    const token = await signSession({ kind: "staff", userId: "u1", role: "SUPER_ADMIN" }, SECRET, 60);
    expect(await verifyStaffSession(token, "y".repeat(32))).toBeNull();
    expect(await verifyStaffSession(token.slice(0, -2) + "xx", SECRET)).toBeNull();
    const expired = await signSession({ kind: "staff", userId: "u1", role: "SUPER_ADMIN" }, SECRET, -10);
    expect(await verifyStaffSession(expired, SECRET)).toBeNull();
    expect(await verifyStaffSession(undefined, SECRET)).toBeNull();
  });

  it("does not accept a customer token as a staff session, or for another client", async () => {
    const token = await signSession({ kind: "customer", clientId: "c1", mobile: "9876543210" }, SECRET, 60);
    expect(await verifyStaffSession(token, SECRET)).toBeNull();
    expect(await verifyCustomerSession(token, SECRET, "c2")).toBeNull();
    expect(await verifyCustomerSession(token, SECRET, "c1")).toEqual({
      kind: "customer",
      clientId: "c1",
      mobile: "9876543210",
    });
  });
});

describe("passwords", () => {
  it("hashes with argon2id and verifies", async () => {
    const h = await hashPassword("s3cret-pass");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(h, "s3cret-pass")).toBe(true);
    expect(await verifyPassword(h, "wrong")).toBe(false);
    expect(await verifyPassword(null, "anything")).toBe(false);
  });
});
