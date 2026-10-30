import { describe, expect, it } from "vitest";
import { clientSettingsSchema, linkCreateSchema, linkUpdateSchema, profileSchema } from "./client";

describe("linkCreateSchema", () => {
  const base = { name: " Wedding ", selectionType: "ALL", showPrice: "on" };

  it("reads checkboxes and normalises the address", () => {
    const v = linkCreateSchema.parse({ ...base, slug: " Rangoli-Vol-3 " });
    expect(v).toMatchObject({ name: "Wedding", slug: "rangoli-vol-3", showPrice: true, allowOrdering: false, isActive: false, selectionValues: [] });
  });

  it("treats an empty address as 'generate one'", () => {
    expect(linkCreateSchema.parse({ ...base, slug: "" }).slug).toBeUndefined();
  });

  it.each(["ab", "has space", "under_score", "-leading", "double--hyphen"])("rejects the address %j", (slug) => {
    expect(linkCreateSchema.safeParse({ ...base, slug }).success).toBe(false);
  });

  it("needs at least one value unless the link shows all products", () => {
    const r = linkUpdateSchema.safeParse({ ...base, selectionType: "CATEGORY", selectionValues: [] });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0]!.path).toEqual(["selectionValues"]);
    expect(linkUpdateSchema.safeParse({ ...base, selectionType: "CATEGORY", selectionValues: ["Saree"] }).success).toBe(true);
  });
});

describe("profileSchema", () => {
  const base = { businessName: "SKT", city: "Surat", paymentModes: ["PAY_LATER"] };

  it("normalises contact and payment details", () => {
    const v = profileSchema.parse({ ...base, whatsappNumber: "098765 43210", upiId: " skt@okhdfcbank ", bankAccountName: "SKT", bankAccountNumber: "1234 5678 9012", bankIfsc: "sbin0001234" });
    expect(v).toMatchObject({ whatsappNumber: "9876543210", upiId: "skt@okhdfcbank", bankAccountNumber: "123456789012", bankIfsc: "SBIN0001234" });
  });

  it("allows empty optional fields", () => {
    const v = profileSchema.parse({ ...base, whatsappNumber: "", upiId: "", gst: "", bankName: "" });
    expect(v.whatsappNumber).toBeUndefined();
    expect(v.upiId).toBeUndefined();
  });

  it("requires full bank details for bank transfer, or when any bank field is filled", () => {
    const paths = (input: object) => profileSchema.safeParse({ ...base, ...input }).error?.issues.map((i) => i.path[0]);
    expect(paths({ paymentModes: ["BANK"] })).toEqual(["bankAccountName", "bankAccountNumber", "bankIfsc"]);
    expect(paths({ bankName: "HDFC" })).toEqual(["bankAccountName", "bankAccountNumber", "bankIfsc"]);
  });

  it("rejects bad UPI IDs, IFSC codes and an empty payment choice", () => {
    const paths = (input: object) => profileSchema.safeParse({ ...base, ...input }).error?.issues.map((i) => i.path[0]);
    expect(paths({ upiId: "not-a-upi" })).toEqual(["upiId"]);
    expect(paths({ bankAccountName: "x", bankAccountNumber: "123456789", bankIfsc: "HDFC1234567" })).toEqual(["bankIfsc"]);
    expect(paths({ paymentModes: [] })).toEqual(["paymentModes"]);
  });
});

describe("clientSettingsSchema", () => {
  it("turns empty numbers into 'use the default'", () => {
    expect(clientSettingsSchema.parse({ outOfStockMode: "badge", lowStockThreshold: "", syncIntervalMin: "", newArrivalDays: "" })).toEqual({
      outOfStockMode: "badge",
      lowStockThreshold: 0,
      writeOrdersTab: false,
      syncIntervalMin: undefined,
      newArrivalDays: undefined,
    });
  });

  it("limits the sync interval to 5 minutes – 1 day", () => {
    expect(clientSettingsSchema.safeParse({ outOfStockMode: "hide", syncIntervalMin: "2" }).success).toBe(false);
    expect(clientSettingsSchema.safeParse({ outOfStockMode: "hide", syncIntervalMin: "1441" }).success).toBe(false);
    expect(clientSettingsSchema.parse({ outOfStockMode: "hide", syncIntervalMin: "30", writeOrdersTab: "on" })).toMatchObject({ syncIntervalMin: 30, writeOrdersTab: true });
  });
});
