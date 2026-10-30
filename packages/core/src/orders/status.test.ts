import { describe, expect, it } from "vitest";
import { DomainError } from "../errors";
import { assertTransition, canTransition, nextStatuses, ORDER_TABS, SIMPLE_ORDER_FLOW, STATUS_LABEL } from "./status";

describe("order status machine", () => {
  it("for now offers only New → Completed, from any open status", () => {
    expect(SIMPLE_ORDER_FLOW).toBe(true);
    for (const open of ["PLACED", "CONFIRMED", "PACKED", "DISPATCHED"] as const) {
      expect(nextStatuses(open)).toEqual(["DELIVERED"]);
      expect(canTransition(open, "DELIVERED")).toBe(true);
      expect(STATUS_LABEL[open]).toBe("New");
    }
    expect(STATUS_LABEL.DELIVERED).toBe("Completed");
    expect(Object.keys(ORDER_TABS)).toEqual(["new", "completed", "all"]);
  });

  it("keeps the full machine: placed → confirmed → packed → dispatched → delivered", () => {
    expect(canTransition("CONFIRMED", "PACKED")).toBe(true);
    expect(canTransition("PACKED", "DISPATCHED")).toBe(true);
    expect(canTransition("DISPATCHED", "DELIVERED")).toBe(true);
  });

  it("doesn't skip steps, go back, or leave a closed order", () => {
    expect(canTransition("PLACED", "PACKED")).toBe(false);
    expect(canTransition("PACKED", "CONFIRMED")).toBe(false);
    expect(canTransition("DISPATCHED", "CANCELLED")).toBe(false); // already shipped
    expect(canTransition("CONFIRMED", "REJECTED")).toBe(false); // reject only before confirming
    for (const closed of ["DELIVERED", "REJECTED", "CANCELLED"] as const) {
      expect(nextStatuses(closed)).toEqual([]);
      expect(canTransition(closed, "DELIVERED")).toBe(false);
    }
  });

  it("needs a reason to reject or cancel", () => {
    expect(() => assertTransition("PLACED", "REJECTED")).toThrow(DomainError);
    expect(() => assertTransition("PLACED", "CANCELLED", "  ")).toThrow(/reason/i);
    expect(() => assertTransition("PLACED", "REJECTED", "Out of stock")).not.toThrow();
    expect(() => assertTransition("DELIVERED", "PACKED")).toThrow(/can.t be marked/);
  });
});

describe("PO link token", () => {
  it("opens one order for one seller only", async () => {
    const { signPoToken, verifyPoToken } = await import("./po-token");
    const secret = "x".repeat(32);
    const token = await signPoToken("order-1", "client-1", secret);
    expect(await verifyPoToken(token, "client-1", secret)).toBe("order-1");
    expect(await verifyPoToken(token, "client-2", secret)).toBeNull();
    expect(await verifyPoToken(token, "client-1", "y".repeat(32))).toBeNull();
    expect(await verifyPoToken(`${token}x`, "client-1", secret)).toBeNull();
  });
});
