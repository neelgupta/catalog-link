import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { forClient, prisma } from "./index";

// Unique per run, so leftovers from an interrupted run never collide.
const run = randomUUID().slice(0, 8);

async function makeClient(name: string) {
  const slug = `${name}-${run}`;
  return prisma.client.create({
    data: { businessName: slug, ownerName: "Owner", mobile: "9876543210", email: `${slug}@x.in`, city: "Surat", slug },
  });
}

const product = (sku: string) => ({
  sku,
  name: `Saree ${sku}`,
  category: "Saree",
  price: 850,
  availableQty: 10,
  rowHash: sku,
  sheetRow: 2,
});

describe("tenant isolation (Postgres)", () => {
  let a: string;
  let b: string;

  beforeAll(async () => {
    a = (await makeClient("tenant-a")).id;
    b = (await makeClient("tenant-b")).id;
    await forClient(a).product.create({ data: { ...product("A-1"), clientId: "ignored" } as never });
    await forClient(b).product.create({ data: product("B-1") as never });
  });

  afterAll(async () => {
    await prisma.client.deleteMany({ where: { id: { in: [a, b] } } });
    await prisma.$disconnect();
  });

  it("stamps clientId on create, ignoring any value passed in", async () => {
    const rows = await prisma.product.findMany({
      where: { clientId: { in: [a, b] } },
      select: { sku: true, clientId: true },
      orderBy: { sku: "asc" },
    });
    expect(rows).toEqual([
      { sku: "A-1", clientId: a },
      { sku: "B-1", clientId: b },
    ]);
  });

  it("only lists the client's own rows", async () => {
    expect((await forClient(a).product.findMany()).map((p) => p.sku)).toEqual(["A-1"]);
    expect(await forClient(b).product.count()).toBe(1);
  });

  it("cannot read another client's row by id", async () => {
    const other = await prisma.product.findFirstOrThrow({ where: { clientId: b } });
    expect(await forClient(a).product.findUnique({ where: { id: other.id } })).toBeNull();
    expect(await forClient(a).product.findFirst({ where: { clientId: b } })).toBeNull();
  });

  it("cannot update or delete another client's rows", async () => {
    const other = await prisma.product.findFirstOrThrow({ where: { clientId: b } });
    expect((await forClient(a).product.updateMany({ where: { id: other.id }, data: { name: "x" } })).count).toBe(0);
    expect((await forClient(a).product.deleteMany({ where: { id: other.id } })).count).toBe(0);
    await expect(forClient(a).product.update({ where: { id: other.id }, data: { name: "x" } })).rejects.toThrow();
    expect((await prisma.product.findUniqueOrThrow({ where: { id: other.id } })).name).toBe("Saree B-1");
  });

  it("enforces unique SKU per client, not globally", async () => {
    await expect(forClient(b).product.create({ data: product("A-1") as never })).resolves.toBeTruthy();
    await expect(forClient(b).product.create({ data: product("A-1") as never })).rejects.toThrow();
  });
});
