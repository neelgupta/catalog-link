import { describe, expect, it } from "vitest";
import { DomainError } from "../errors";
import { assertTransition, canTransition, nextStatuses } from "./status";

describe("order status machine", () => {
  it("follows placed → confirmed → packed → dispatched → delivered", () => {
    expect(nextStatuses("PLACED")).toEqual(["CONFIRMED", "REJECTED", "CANCELLED"]);
    expect(canTransition("CONFIRMED", "PACKED")).toBe(true);
    expect(canTransition("PACKED", "DISPATCHED")).toBe(true);
    expect(canTransition("DISPATCHED", "DELIVERED")).toBe(true);
  });

  it("doesn't skip steps, go back, or leave a closed order", () => {
    expect(canTransition("PLACED", "PACKED")).toBe(false);
    expect(canTransition("PACKED", "CONFIRMED")).toBe(false);
    expect(canTransition("DISPATCHED", "CANCELLED")).toBe(false); // already shipped
    expect(canTransition("CONFIRMED", "REJECTED")).toBe(false); // reject only before confirming
    for (const closed of ["DELIVERED", "REJECTED", "CANCELLED"] as const) expect(nextStatuses(closed)).toEqual([]);
  });

  it("needs a reason to reject or cancel", () => {
    expect(() => assertTransition("PLACED", "REJECTED")).toThrow(DomainError);
    expect(() => assertTransition("PLACED", "CANCELLED", "  ")).toThrow(/reason/i);
    expect(() => assertTransition("PLACED", "REJECTED", "Out of stock")).not.toThrow();
    expect(() => assertTransition("DELIVERED", "PACKED")).toThrow(/can't be marked packed/);
  });
});
