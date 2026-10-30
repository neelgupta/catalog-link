import { randomInt } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "./index";

// Unique per run, so leftovers from an interrupted run never interfere.
const mobile = `9${randomInt(100_000_000, 999_999_999)}`;

describe("OtpRequest table (Postgres)", () => {
  afterAll(async () => {
    await prisma.otpRequest.deleteMany({ where: { mobile } });
    await prisma.$disconnect();
  });

  it("stores and finds the latest active OTP by mobile and purpose", async () => {
    const base = { mobile, purpose: "CLIENT_LOGIN" as const, expiresAt: new Date(Date.now() + 60_000) };
    await prisma.otpRequest.create({ data: { ...base, codeHash: "first", consumedAt: new Date() } });
    await prisma.otpRequest.create({ data: { ...base, codeHash: "second" } });

    const latest = await prisma.otpRequest.findFirst({
      where: { mobile: base.mobile, purpose: base.purpose, clientId: null, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });
    expect(latest?.codeHash).toBe("second");
  });
});
