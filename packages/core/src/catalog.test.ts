import { describe, expect, it } from "vitest";
import {
  type CatalogItem,
  catalogFacets,
  catalogFilterParams,
  filterCatalog,
  pageCatalog,
  parseCatalogFilters,
  sellerWhatsappUrl,
  telUrl,
} from "./catalog";

let row = 0;
const item = (o: Partial<CatalogItem>): CatalogItem => ({
  id: `p${++row}`,
  sku: `SKU-${row}`,
  name: "Product",
  catalogName: null,
  category: "Saree",
  fabric: null,
  colours: [],
  sizes: [],
  piecesPerSet: null,
  price: 500,
  mrp: null,
  listPrice: null,
  discountLabel: null,
  priceType: "PIECE",
  moq: 1,
  availableQty: 10,
  isNew: false,
  firstSeenAt: "2026-10-01T00:00:00.000Z",
  sheetRow: row,
  image: null,
  ...o,
});

const items = [
  item({ name: "Banarasi Silk Saree", catalogName: "Rangoli Vol-3", fabric: "Banarasi Silk", colours: ["Red", "Green"], price: 850, isNew: true }),
  item({ name: "Georgette Saree", catalogName: "rangoli vol-3", fabric: "Georgette", colours: ["Blue"], price: 640, availableQty: 0 }),
  item({ name: "Cotton Kurti", category: "Kurti", catalogName: "Summer Vol-1", fabric: "Cotton", colours: ["red"], price: 1800, firstSeenAt: "2026-10-20T00:00:00.000Z" }),
  item({ name: "Bridal Lehenga", category: "Lehenga", fabric: "Velvet", price: 7800 }),
];
const names = (list: CatalogItem[]) => list.map((p) => p.name);

describe("parseCatalogFilters / catalogFilterParams", () => {
  it("reads URL params and ignores junk", () => {
    const f = parseCatalogFilters(new URLSearchParams("q=+silk+&category=Saree&min=500&max=abc&new=1&stock=0&sort=bogus"));
    expect(f).toEqual({ q: "silk", category: "Saree", catalog: undefined, fabric: undefined, colour: undefined, min: 500, max: undefined, newOnly: true, inStock: false, sort: "default" });
  });

  it("round-trips, leaving empty and omitted fields out", () => {
    const f = parseCatalogFilters({ colour: "Red", min: "0", sort: "price_asc", stock: "1", catalog: "X" });
    expect(catalogFilterParams(f).toString()).toBe("catalog=X&colour=Red&min=0&stock=1&sort=price_asc");
    expect(catalogFilterParams(f, ["catalog", "colour"]).toString()).toBe("min=0&stock=1&sort=price_asc");
  });
});

describe("filterCatalog", () => {
  const f = (o: Record<string, string>) => filterCatalog(items, parseCatalogFilters(o));

  it("searches name, fabric, catalog and colour case-insensitively", () => {
    expect(names(f({ q: "SILK" }))).toEqual(["Banarasi Silk Saree"]);
    expect(names(f({ q: "velvet" }))).toEqual(["Bridal Lehenga"]);
    expect(names(f({ q: "summer" }))).toEqual(["Cotton Kurti"]);
  });

  it("filters by category, catalog, fabric and colour without caring about case", () => {
    expect(names(f({ category: "saree" }))).toEqual(["Banarasi Silk Saree", "Georgette Saree"]);
    expect(names(f({ catalog: "Rangoli Vol-3" }))).toEqual(["Banarasi Silk Saree", "Georgette Saree"]);
    expect(names(f({ colour: "RED" }))).toEqual(["Banarasi Silk Saree", "Cotton Kurti"]);
  });

  it("filters by price range, new arrivals and stock", () => {
    expect(names(f({ min: "700", max: "2000" }))).toEqual(["Banarasi Silk Saree", "Cotton Kurti"]);
    expect(names(f({ new: "1" }))).toEqual(["Banarasi Silk Saree"]);
    expect(f({ stock: "1" })).toHaveLength(3);
  });

  it("ignores price filters when prices are hidden", () => {
    const hidden = items.map((p) => ({ ...p, price: null }));
    expect(filterCatalog(hidden, parseCatalogFilters({ min: "5000" }))).toHaveLength(4);
  });

  it("sorts by price and by newest, keeping sheet order for ties", () => {
    expect(names(f({ sort: "price_desc" }))[0]).toBe("Bridal Lehenga");
    expect(names(f({ sort: "price_asc" }))[0]).toBe("Georgette Saree");
    expect(names(f({ sort: "new" }))[0]).toBe("Cotton Kurti");
    expect(names(f({}))).toEqual(names(items));
  });
});

describe("catalogFacets", () => {
  it("counts options case-insensitively and finds the price range", () => {
    const facets = catalogFacets(items);
    expect(facets.categories).toEqual([
      { name: "Kurti", count: 1 },
      { name: "Lehenga", count: 1 },
      { name: "Saree", count: 2 },
    ]);
    expect(facets.catalogs.map(({ name, count }) => ({ name, count }))).toEqual([
      { name: "Rangoli Vol-3", count: 2 },
      { name: "Summer Vol-1", count: 1 },
    ]);
    expect(facets.colours.find((c) => c.name.toLowerCase() === "red")?.count).toBe(2);
    expect(facets.price).toEqual({ min: 640, max: 7800 });
    expect(facets.newCount).toBe(1);
  });

  it("has no price range when prices are hidden", () => {
    expect(catalogFacets(items.map((p) => ({ ...p, price: null }))).price).toBeNull();
  });
});

describe("pageCatalog", () => {
  it("pages by offset", () => {
    const many = Array.from({ length: 50 }, () => item({}));
    expect(pageCatalog(many)).toMatchObject({ nextCursor: 24, total: 50 });
    expect(pageCatalog(many, 48)).toMatchObject({ nextCursor: null });
    expect(pageCatalog(many, 48).items).toHaveLength(2);
    expect(pageCatalog(many, -5).items[0]).toBe(many[0]);
  });
});

describe("contact links", () => {
  it("adds the Indian country code to 10-digit numbers", () => {
    expect(sellerWhatsappUrl("9876543210", "Hi & bye")).toBe("https://wa.me/919876543210?text=Hi%20%26%20bye");
    expect(sellerWhatsappUrl("919876543210")).toBe("https://wa.me/919876543210");
    expect(telUrl("9876543210")).toBe("tel:+919876543210");
  });
});
