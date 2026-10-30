import { describe, expect, it } from "vitest";
import { applyDiscount, discountFor, discountLabel, freeProducts, parseLinkPricing, priceOnLink } from "./link-pricing";

const pct = (value: number) => ({ kind: "PERCENT" as const, value });
const amt = (value: number) => ({ kind: "AMOUNT" as const, value });

describe("applyDiscount", () => {
  it("takes a % off and rounds whole-rupee prices to whole rupees", () => {
    expect(applyDiscount(1000, pct(10))).toBe(900);
    expect(applyDiscount(999, pct(12.5))).toBe(874);
    expect(applyDiscount(850, pct(15))).toBe(723); // 722.5 rounds up
  });
  it("keeps paise when the sheet price has paise", () => {
    expect(applyDiscount(737.5, pct(10))).toBe(663.75);
  });
  it("takes a ₹ amount off and never goes below 0", () => {
    expect(applyDiscount(850, amt(50))).toBe(800);
    expect(applyDiscount(40, amt(50))).toBe(0);
  });
});

describe("discountFor", () => {
  it("ALL applies to every product, GROUP to the chosen ones, EACH per product", () => {
    expect(discountFor({ mode: "ALL", discount: pct(5) }, "a")).toEqual(pct(5));
    const group = { mode: "GROUP" as const, discount: amt(20), productIds: ["a"] };
    expect(discountFor(group, "a")).toEqual(amt(20));
    expect(discountFor(group, "b")).toBeNull();
    const each = { mode: "EACH" as const, discounts: { a: pct(10), b: amt(30) } };
    expect(discountFor(each, "b")).toEqual(amt(30));
    expect(discountFor(each, "c")).toBeNull();
    expect(discountFor({ mode: "NONE" }, "a")).toBeNull();
  });
});

describe("priceOnLink", () => {
  it("returns the sheet price as the crossed-out price with a label", () => {
    expect(priceOnLink({ mode: "ALL", discount: pct(10) }, "a", 1000)).toEqual({ price: 900, listPrice: 1000, label: "10% off" });
  });
  it("has no list price when nothing is taken off", () => {
    expect(priceOnLink({ mode: "NONE" }, "a", 1000)).toEqual({ price: 1000, listPrice: null, label: null });
    expect(priceOnLink({ mode: "ALL", discount: pct(0.01) }, "a", 10)).toEqual({ price: 10, listPrice: null, label: null });
  });
});

describe("parseLinkPricing", () => {
  it("reads stored pricing and treats bad or empty JSON as no discount", () => {
    expect(parseLinkPricing({ mode: "ALL", discount: { kind: "PERCENT", value: 10 } })).toEqual({ mode: "ALL", discount: pct(10) });
    expect(parseLinkPricing({})).toEqual({ mode: "NONE" });
    expect(parseLinkPricing({ mode: "ALL", discount: { kind: "PERCENT", value: 150 } })).toEqual({ mode: "NONE" });
  });
});

describe("discountLabel / freeProducts", () => {
  it("labels and finds products a discount would make free", () => {
    expect(discountLabel(amt(1500))).toBe("₹1,500 off");
    const products = [
      { id: "a", name: "A", price: 40 },
      { id: "b", name: "B", price: 900 },
    ];
    expect(freeProducts({ mode: "ALL", discount: amt(50) }, products).map((p) => p.id)).toEqual(["a"]);
  });
});
