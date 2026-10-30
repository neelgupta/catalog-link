import { describe, expect, it } from "vitest";
import { emailSchema, mobileSchema, otpCodeSchema } from "./common";

describe("mobileSchema", () => {
  it.each([
    ["9876543210", "9876543210"],
    ["+91 98765 43210", "9876543210"],
    ["919876543210", "9876543210"],
    ["09876543210", "9876543210"],
    ["98765-43210", "9876543210"],
  ])("normalises %s", (input, expected) => {
    expect(mobileSchema.parse(input)).toBe(expected);
  });

  it.each(["12345", "5876543210", "98765432101", "abcdefghij"])("rejects %s", (input) => {
    expect(mobileSchema.safeParse(input).success).toBe(false);
  });
});

describe("emailSchema", () => {
  it("lowercases and trims", () => {
    expect(emailSchema.parse("  Owner@Shop.IN ")).toBe("owner@shop.in");
  });
});

describe("otpCodeSchema", () => {
  it("accepts 6 digits only", () => {
    expect(otpCodeSchema.safeParse("123456").success).toBe(true);
    expect(otpCodeSchema.safeParse("12345").success).toBe(false);
    expect(otpCodeSchema.safeParse("12a456").success).toBe(false);
  });
});
