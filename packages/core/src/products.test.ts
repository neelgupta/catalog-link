import { describe, expect, it } from "vitest";
import { isNewArrival } from "./products";
import { parseClientSettings } from "./profile";

describe("isNewArrival", () => {
  const now = new Date("2026-10-29T12:00:00Z");
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

  it("is new within the window or when tagged", () => {
    expect(isNewArrival({ tags: [], firstSeenAt: daysAgo(3) }, 7, now)).toBe(true);
    expect(isNewArrival({ tags: [], firstSeenAt: daysAgo(8) }, 7, now)).toBe(false);
    expect(isNewArrival({ tags: ["Wedding", " new arrival "], firstSeenAt: daysAgo(60) }, 7, now)).toBe(true);
  });
});

describe("parseClientSettings", () => {
  it("fills defaults for missing or malformed values", () => {
    expect(parseClientSettings({})).toEqual({ outOfStockMode: "badge", lowStockThreshold: 0, writeOrdersTab: false, syncIntervalMin: null, newArrivalDays: null });
    expect(parseClientSettings({ outOfStockMode: "weird", lowStockThreshold: -1, syncIntervalMin: "10", newArrivalDays: 0 })).toMatchObject({
      outOfStockMode: "badge",
      lowStockThreshold: 0,
      syncIntervalMin: null,
      newArrivalDays: null,
    });
    expect(parseClientSettings({ outOfStockMode: "hide", lowStockThreshold: 5, writeOrdersTab: true, syncIntervalMin: 15 })).toMatchObject({
      outOfStockMode: "hide",
      lowStockThreshold: 5,
      writeOrdersTab: true,
      syncIntervalMin: 15,
    });
  });
});
