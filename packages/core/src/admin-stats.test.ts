import { describe, expect, it } from "vitest";
import { istPeriodStarts } from "./admin-stats";
import { daysLeft, isClientAvailable, subscriptionTerms } from "./subscriptions";

describe("istPeriodStarts", () => {
  it("uses the IST calendar day, not the UTC one", () => {
    // 20:00 UTC on 31 Oct is 01:30 IST on 1 Nov.
    const { today, month } = istPeriodStarts(new Date("2026-10-31T20:00:00Z"));
    expect(today.toISOString()).toBe("2026-10-31T18:30:00.000Z"); // 1 Nov 00:00 IST
    expect(month.toISOString()).toBe("2026-10-31T18:30:00.000Z");
  });
});

describe("subscriptions", () => {
  const start = new Date("2026-11-01T00:00:00Z");

  it("trial expires after the trial days; paid after the plan duration", () => {
    expect(subscriptionTerms(start, 14, 365)).toEqual({ status: "TRIAL", expiresAt: new Date("2026-11-15T00:00:00Z") });
    expect(subscriptionTerms(start, 0, 365)).toEqual({ status: "ACTIVE", expiresAt: new Date("2027-11-01T00:00:00Z") });
  });

  it("catalog is available only for an active client with an unexpired plan", () => {
    const now = new Date("2026-11-10T00:00:00Z");
    const valid = { expiresAt: new Date("2026-11-15T00:00:00Z") };
    expect(isClientAvailable({ status: "ACTIVE" }, valid, now)).toBe(true);
    expect(isClientAvailable({ status: "INACTIVE" }, valid, now)).toBe(false);
    expect(isClientAvailable({ status: "ACTIVE" }, { expiresAt: new Date("2026-11-09T00:00:00Z") }, now)).toBe(false);
    expect(isClientAvailable({ status: "ACTIVE" }, null, now)).toBe(false);
  });

  it("counts days left, rounding up", () => {
    expect(daysLeft(new Date("2026-11-15T12:00:00Z"), new Date("2026-11-10T00:00:00Z"))).toBe(6);
    expect(daysLeft(new Date("2026-11-09T00:00:00Z"), new Date("2026-11-10T00:00:00Z"))).toBe(-1);
  });
});
