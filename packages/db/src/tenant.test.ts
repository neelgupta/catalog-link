import { describe, expect, it } from "vitest";
import { scopeArgs } from "./tenant";

describe("scopeArgs", () => {
  it("adds clientId to where for reads", () => {
    expect(scopeArgs("findMany", { where: { category: "Saree" } }, "c1")).toEqual({
      where: { category: "Saree", clientId: "c1" },
    });
    expect(scopeArgs("count", undefined, "c1")).toEqual({ where: { clientId: "c1" } });
  });

  it("keeps a conflicting caller clientId filter so the query matches nothing", () => {
    expect(scopeArgs("findFirst", { where: { clientId: "other" } }, "c1").where).toEqual({
      clientId: "c1",
      AND: [{ clientId: "other" }],
    });
    expect(
      scopeArgs("findMany", { where: { clientId: "other", AND: { sku: "A" } } }, "c1").where,
    ).toEqual({ clientId: "c1", AND: [{ sku: "A" }, { clientId: "other" }] });
    expect(scopeArgs("findFirst", { where: { clientId: "c1" } }, "c1").where).toEqual({ clientId: "c1" });
  });

  it("overrides a clientId passed in create data", () => {
    expect(scopeArgs("create", { data: { clientId: "other", sku: "A" } }, "c1").data).toEqual({
      clientId: "c1",
      sku: "A",
    });
  });

  it("sets clientId on every createMany row", () => {
    expect(scopeArgs("createMany", { data: [{ sku: "A" }, { sku: "B" }] }, "c1").data).toEqual([
      { sku: "A", clientId: "c1" },
      { sku: "B", clientId: "c1" },
    ]);
  });

  it("scopes both where and create on upsert", () => {
    const args = scopeArgs(
      "upsert",
      { where: { id: "x" }, create: { sku: "A" }, update: { name: "N" } },
      "c1",
    );
    expect(args.where).toEqual({ id: "x", clientId: "c1" });
    expect(args.create).toEqual({ sku: "A", clientId: "c1" });
    expect(args.update).toEqual({ name: "N" });
  });

  it("scopes updates and deletes", () => {
    for (const op of ["update", "updateMany", "delete", "deleteMany"]) {
      expect(scopeArgs(op, { where: { id: "x" } }, "c1").where).toEqual({ id: "x", clientId: "c1" });
    }
  });
});
