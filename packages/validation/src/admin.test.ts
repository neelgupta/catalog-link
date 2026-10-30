import { describe, expect, it } from "vitest";
import { clientCreateSchema, gstSchema, planSchema, subscriptionSchema } from "./admin";

const validClient = {
  businessName: " Shree Krishna Textiles ",
  ownerName: "Ramesh Patel",
  mobile: "+91 98765 43210",
  email: "Owner@SKT.in",
  gst: "",
  city: "Surat",
  address: "",
  password: "longenough",
  planId: "plan1",
  trialDays: "14",
};

describe("clientCreateSchema", () => {
  it("normalises a valid client", () => {
    const v = clientCreateSchema.parse(validClient);
    expect(v).toMatchObject({
      businessName: "Shree Krishna Textiles",
      mobile: "9876543210",
      email: "owner@skt.in",
      trialDays: 14,
    });
    expect(v.gst).toBeUndefined();
    expect(v.address).toBeUndefined();
  });

  it("reports each bad field", () => {
    const r = clientCreateSchema.safeParse({ ...validClient, businessName: "", password: "short", mobile: "123" });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path[0]);
    expect(paths).toEqual(expect.arrayContaining(["businessName", "password", "mobile"]));
  });
});

describe("gstSchema", () => {
  it("accepts and upper-cases a valid GSTIN", () => {
    expect(gstSchema.parse("24aaacr5055k1z5")).toBe("24AAACR5055K1Z5");
  });
  it("rejects a malformed GSTIN", () => {
    expect(gstSchema.safeParse("24AAACR5055K1X5").success).toBe(false);
    expect(gstSchema.safeParse("12345").success).toBe(false);
  });
});

describe("planSchema", () => {
  it("coerces numbers from form strings", () => {
    expect(
      planSchema.parse({
        name: "Pro",
        maxProducts: "5000",
        maxCustomLinks: "25",
        maxStaff: "3",
        maxOrdersPerMonth: "2000",
        price: "20000",
        durationDays: "365",
      }),
    ).toMatchObject({ maxProducts: 5000, price: 20000, isActive: true });
  });
  it("rejects zero products", () => {
    expect(planSchema.safeParse({ name: "X", maxProducts: "0", maxCustomLinks: "0", maxStaff: "0", maxOrdersPerMonth: "1", price: "0", durationDays: "1" }).success).toBe(false);
  });
});

describe("subscriptionSchema", () => {
  it("requires expiry after start", () => {
    const base = { planId: "p", startAt: "2026-11-01", trialDays: "0" };
    expect(subscriptionSchema.safeParse({ ...base, expiresAt: "2026-11-01" }).success).toBe(false);
    expect(subscriptionSchema.parse({ ...base, expiresAt: "2027-11-01" }).expiresAt.toISOString()).toBe(
      "2027-11-01T00:00:00.000Z",
    );
  });
});
