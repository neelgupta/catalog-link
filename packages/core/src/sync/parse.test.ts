import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "../crypto";
import { parseImageRef, parseSpreadsheetId, splitList } from "../google/links";
import { FIELDS, mapHeaders, normalizeHeader, TEMPLATE_HEADERS } from "./headers";
import { parseRows } from "./validate";

const TEMPLATE_ROW = FIELDS.map((f) => TEMPLATE_HEADERS[f]);
const { map: TEMPLATE_MAP } = mapHeaders(TEMPLATE_ROW);

/** Builds a data row in template column order. */
function row(values: Partial<Record<(typeof FIELDS)[number], string>>) {
  return FIELDS.map((f) => values[f] ?? "");
}
const valid = {
  sku: "SK-1021",
  name: "Banarasi Silk Saree",
  category: "Saree",
  price: "850",
  availableQty: "120",
  images: "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUv/view?usp=sharing",
  active: "Yes",
};

describe("headers", () => {
  it("maps every template header", () => {
    const { map, missing, unknown } = mapHeaders(TEMPLATE_ROW);
    expect(missing).toEqual([]);
    expect(unknown).toEqual([]);
    expect(Object.keys(map)).toHaveLength(FIELDS.length);
  });

  it("accepts common alternative headers in any order", () => {
    const { map, missing } = mapHeaders(["Qty", "Design No", "Rate", "Name", "Type", "Photos", "Show", "Colors", "Remarks"]);
    expect(missing).toEqual([]);
    expect(map).toMatchObject({ availableQty: 0, sku: 1, price: 2, name: 3, category: 4, images: 5, active: 6, colours: 7 });
  });

  it("reports missing required columns", () => {
    expect(mapHeaders(["SKU", "Name"]).missing).toEqual(["category", "price", "availableQty", "images", "active"]);
  });

  it("normalises currency, brackets and punctuation without mangling words", () => {
    expect(normalizeHeader(" Wholesale Price (₹) ")).toBe("wholesale price");
    expect(normalizeHeader("Colours / Variants")).toBe("colours / variants");
    expect(normalizeHeader("Price Rs.")).toBe("price");
    expect(normalizeHeader("GST %")).toBe("gst %");
  });
});

describe("links", () => {
  it("parses spreadsheet URLs and bare IDs", () => {
    const id = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms";
    expect(parseSpreadsheetId(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`)).toBe(id);
    expect(parseSpreadsheetId(id)).toBe(id);
    expect(parseSpreadsheetId("https://example.com/sheet")).toBeNull();
  });

  it.each([
    ["https://drive.google.com/file/d/1AbCdEfGhIjK/view?usp=sharing", { kind: "file", id: "1AbCdEfGhIjK" }],
    ["https://drive.google.com/file/u/0/d/1AbCdEfGhIjK/view", { kind: "file", id: "1AbCdEfGhIjK" }],
    ["https://drive.google.com/open?id=1AbCdEfGhIjK", { kind: "file", id: "1AbCdEfGhIjK" }],
    ["https://drive.google.com/uc?export=view&id=1AbCdEfGhIjK", { kind: "file", id: "1AbCdEfGhIjK" }],
    ["https://drive.google.com/thumbnail?id=1AbCdEfGhIjK&sz=w400", { kind: "file", id: "1AbCdEfGhIjK" }],
    ["https://lh3.googleusercontent.com/d/1AbCdEfGhIjK", { kind: "file", id: "1AbCdEfGhIjK" }],
    ["https://drive.google.com/drive/folders/1FoLdErIdXyZ?usp=sharing", { kind: "folder", id: "1FoLdErIdXyZ" }],
    ["https://drive.google.com/drive/u/1/folders/1FoLdErIdXyZ", { kind: "folder", id: "1FoLdErIdXyZ" }],
    ["https://cdn.example.com/a.jpg", { kind: "url", url: "https://cdn.example.com/a.jpg" }],
  ])("%s", (input, expected) => {
    expect(parseImageRef(input)).toEqual(expected);
  });

  it("rejects non-links", () => {
    expect(parseImageRef("photo1.jpg")).toBeNull();
    expect(parseImageRef("http://insecure.example.com/a.jpg")).toBeNull();
  });

  it("splits lists on commas and new lines", () => {
    expect(splitList("Red, Green,\nBlue ,, ")).toEqual(["Red", "Green", "Blue"]);
  });
});

describe("parseRows", () => {
  it("parses a full row with formatting noise", () => {
    const { products, errors } = parseRows(
      [
        row({
          ...valid,
          catalogName: "Rangoli Vol-3",
          colours: "Red, Green",
          sizes: "M,L",
          piecesPerSet: "4 pcs",
          price: "₹1,499.50",
          mrp: "1999",
          priceType: "Per set",
          moq: "2 set",
          gstPct: "5%",
          tags: "New Arrival, Wedding",
          videoUrl: "https://youtu.be/abc",
        }),
      ],
      TEMPLATE_MAP,
      100,
    );
    expect(errors).toEqual([]);
    expect(products[0]).toMatchObject({
      sheetRow: 2,
      price: "1499.50",
      mrp: "1999.00",
      priceType: "SET",
      moq: 2,
      piecesPerSet: 4,
      gstPct: "5.00",
      colours: ["Red", "Green"],
      tags: ["New Arrival", "Wedding"],
      sheetActive: true,
      imageRefs: [{ kind: "file", id: "1AbCdEfGhIjKlMnOpQrStUv" }],
    });
  });

  it("skips bad rows with their sheet row numbers and ignores blank rows", () => {
    const { products, errors, dataRows, skipped } = parseRows(
      [
        row(valid), // row 2
        row({}), // row 3 blank
        row({ ...valid, sku: "", name: "No SKU" }), // row 4
        row({ ...valid, sku: "B", price: "" }), // row 5
        row({ ...valid, sku: "C", price: "abc" }), // row 6
        row({ ...valid, sku: "D", images: "" }), // row 7
        row({ ...valid, sku: "E", images: "photo.jpg" }), // row 8
        row({ ...valid, sku: "sk-1021" }), // row 9 duplicate (case-insensitive)
        row({ ...valid, sku: "F", availableQty: "12.5" }), // row 10
        row({ ...valid, sku: "G", availableQty: "" }), // row 11
      ],
      TEMPLATE_MAP,
      100,
    );
    expect(products.map((p) => p.sku)).toEqual(["SK-1021"]);
    expect(dataRows).toBe(9);
    expect(skipped).toBe(8);
    expect(errors.map((e) => [e.rowNumber, e.code])).toEqual([
      [4, "MISSING_SKU"],
      [5, "MISSING_PRICE"],
      [6, "BAD_NUMBER"],
      [7, "MISSING_IMAGE"],
      [8, "BAD_IMAGE_LINK"],
      [9, "DUPLICATE_SKU"],
      [10, "BAD_NUMBER"],
      [11, "MISSING_QTY"],
    ]);
    expect(errors.find((e) => e.code === "DUPLICATE_SKU")?.message).toContain("row 2");
  });

  it("keeps a row with some unreadable image links, with a warning", () => {
    const { products, errors } = parseRows([row({ ...valid, images: `${valid.images}, not-a-link` })], TEMPLATE_MAP, 100);
    expect(products).toHaveLength(1);
    expect(errors).toEqual([expect.objectContaining({ code: "BAD_IMAGE_LINK", skipped: false })]);
  });

  it("treats No/Hide as inactive and anything else as active", () => {
    const { products } = parseRows(
      [row({ ...valid, sku: "1", active: "No" }), row({ ...valid, sku: "2", active: "hide" }), row({ ...valid, sku: "3", active: "" })],
      TEMPLATE_MAP,
      100,
    );
    expect(products.map((p) => p.sheetActive)).toEqual([false, false, true]);
  });

  it("stops at the plan limit", () => {
    const rows = ["1", "2", "3"].map((sku) => row({ ...valid, sku }));
    const { products, errors } = parseRows(rows, TEMPLATE_MAP, 2);
    expect(products).toHaveLength(2);
    expect(errors).toEqual([expect.objectContaining({ rowNumber: 4, code: "PLAN_LIMIT", skipped: true })]);
  });

  it("row hash ignores the row position but tracks content", () => {
    const a = parseRows([row(valid)], TEMPLATE_MAP, 10).products[0]!;
    const moved = parseRows([row({}), row(valid)], TEMPLATE_MAP, 10).products[0]!;
    const changed = parseRows([row({ ...valid, availableQty: "119" })], TEMPLATE_MAP, 10).products[0]!;
    expect(moved.sheetRow).toBe(3);
    expect(moved.rowHash).toBe(a.rowHash);
    expect(changed.rowHash).not.toBe(a.rowHash);
  });
});

describe("crypto", () => {
  const key = Buffer.alloc(32, 7).toString("base64");
  it("round-trips and never repeats ciphertext", () => {
    const a = encryptSecret("refresh-token", key);
    expect(a).not.toBe(encryptSecret("refresh-token", key));
    expect(decryptSecret(a, key)).toBe("refresh-token");
  });
  it("detects tampering and wrong keys", () => {
    const a = encryptSecret("refresh-token", key);
    const tampered = a.slice(0, -4) + (a.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(() => decryptSecret(tampered, key)).toThrow();
    expect(() => decryptSecret(a, Buffer.alloc(32, 8).toString("base64"))).toThrow();
  });
});
