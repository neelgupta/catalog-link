import { createHash } from "node:crypto";
import { parseImageRef, splitList, type ImageRef } from "../google/links";
import { TEMPLATE_HEADERS, type Field, type HeaderMap } from "./headers";

export type ParsedProduct = {
  sheetRow: number;
  sku: string;
  name: string;
  catalogName: string | null;
  category: string;
  fabric: string | null;
  colours: string[];
  sizes: string[];
  piecesPerSet: number | null;
  /** Decimal as a string ("850.00") so no float rounding reaches the database. */
  price: string;
  mrp: string | null;
  priceType: "PIECE" | "SET";
  moq: number;
  availableQty: number;
  imageRefs: ImageRef[];
  videoUrl: string | null;
  description: string | null;
  gstPct: string | null;
  sheetActive: boolean;
  tags: string[];
  /** Hash of everything above except sheetRow: unchanged rows are skipped on sync. */
  rowHash: string;
};

export type RowError = {
  rowNumber: number;
  sku: string | null;
  code: string;
  message: string;
  /** true when the row was not imported; false for warnings on an imported row. */
  skipped: boolean;
};

class RowProblem extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

const label = (f: Field) => TEMPLATE_HEADERS[f];

/** "₹1,499.50" -> 1499.5; "" -> null; junk -> throws */
function parseNumber(raw: string, field: Field): number | null {
  const cleaned = raw.replace(/₹|rs\.?|inr|%|,|\s/gi, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) throw new RowProblem("BAD_NUMBER", `${label(field)} "${raw}" is not a number`);
  return n;
}

function parseMoney(raw: string, field: Field, required: boolean): string | null {
  const n = parseNumber(raw, field);
  if (n === null) {
    if (required) throw new RowProblem(`MISSING_${field === "price" ? "PRICE" : field.toUpperCase()}`, `${label(field)} is missing`);
    return null;
  }
  if (n < 0 || (required && n === 0)) throw new RowProblem("BAD_NUMBER", `${label(field)} must be more than 0`);
  if (n > 99_999_999) throw new RowProblem("BAD_NUMBER", `${label(field)} is too large`);
  return n.toFixed(2);
}

function parseWholeNumber(raw: string, field: Field): number | null {
  const n = parseNumber(raw, field);
  if (n === null) return null;
  if (!Number.isInteger(n) || n < 0) throw new RowProblem("BAD_NUMBER", `${label(field)} "${raw}" must be a whole number`);
  if (n > 10_000_000) throw new RowProblem("BAD_NUMBER", `${label(field)} is too large`);
  return n;
}

/** "1 set", "2 pcs", "3" -> leading whole number. */
function parseLeadingInt(raw: string): number | null {
  const m = raw.match(/\d+/);
  return m ? Number(m[0]) : null;
}

const INACTIVE = new Set(["no", "n", "false", "0", "hide", "hidden", "inactive", "off"]);

function text(raw: string | undefined, max: number) {
  const v = (raw ?? "").trim();
  return v ? v.slice(0, max) : null;
}

function hashRow(p: Omit<ParsedProduct, "rowHash" | "sheetRow">) {
  return createHash("sha1").update(JSON.stringify(p)).digest("hex");
}

/**
 * Validates data rows (sheet row numbers start at 2; the header is row 1).
 * Blank rows are ignored. Rows with problems are skipped and reported. Valid rows beyond
 * `maxProducts` are reported as PLAN_LIMIT.
 */
export function parseRows(rows: readonly (readonly string[])[], headerMap: HeaderMap, maxProducts: number) {
  const products: ParsedProduct[] = [];
  const errors: RowError[] = [];
  const seen = new Map<string, number>();
  let dataRows = 0;

  rows.forEach((row, i) => {
    const rowNumber = i + 2;
    if (!row.some((c) => c?.trim())) return;
    dataRows++;
    const cell = (f: Field) => {
      const idx = headerMap[f];
      return idx === undefined ? "" : (row[idx] ?? "").toString().trim();
    };
    const sku = text(cell("sku"), 64);

    try {
      if (!sku) throw new RowProblem("MISSING_SKU", `${label("sku")} is missing`);
      const name = text(cell("name"), 200);
      if (!name) throw new RowProblem("MISSING_NAME", `${label("name")} is missing`);
      const category = text(cell("category"), 80);
      if (!category) throw new RowProblem("MISSING_CATEGORY", `${label("category")} is missing`);
      const price = parseMoney(cell("price"), "price", true)!;
      const availableQty = parseWholeNumber(cell("availableQty"), "availableQty");
      if (availableQty === null) throw new RowProblem("MISSING_QTY", `${label("availableQty")} is missing`);

      const imageCells = splitList(cell("images"));
      const imageRefs = imageCells.map(parseImageRef).filter((r): r is ImageRef => r !== null);
      if (imageCells.length === 0) throw new RowProblem("MISSING_IMAGE", `${label("images")} is missing`);
      if (imageRefs.length === 0) {
        throw new RowProblem("BAD_IMAGE_LINK", `None of the image links could be read: "${imageCells[0]}"`);
      }

      const key = sku.toUpperCase();
      const firstRow = seen.get(key);
      if (firstRow !== undefined) throw new RowProblem("DUPLICATE_SKU", `SKU "${sku}" is already used in row ${firstRow}`);
      seen.set(key, rowNumber);

      if (products.length >= maxProducts) {
        throw new RowProblem("PLAN_LIMIT", `Your plan allows ${maxProducts} products; this row was not imported`);
      }

      const priceTypeRaw = cell("priceType").toLowerCase();
      const gst = parseNumber(cell("gstPct"), "gstPct");
      if (gst !== null && (gst < 0 || gst > 28)) throw new RowProblem("BAD_NUMBER", `${label("gstPct")} must be between 0 and 28`);
      const video = text(cell("videoUrl"), 500);

      const product = {
        sku,
        name,
        catalogName: text(cell("catalogName"), 120),
        category,
        fabric: text(cell("fabric"), 120),
        colours: splitList(cell("colours")).slice(0, 50),
        sizes: splitList(cell("sizes")).slice(0, 50),
        piecesPerSet: parseLeadingInt(cell("piecesPerSet")),
        price,
        mrp: parseMoney(cell("mrp"), "mrp", false),
        priceType: priceTypeRaw.includes("set") ? ("SET" as const) : ("PIECE" as const),
        moq: Math.max(1, parseLeadingInt(cell("moq")) ?? 1),
        availableQty,
        imageRefs,
        videoUrl: video && /^https:\/\//i.test(video) ? video : null,
        description: text(cell("description"), 2000),
        gstPct: gst === null ? null : gst.toFixed(2),
        sheetActive: !INACTIVE.has(cell("active").toLowerCase()),
        tags: splitList(cell("tags")).slice(0, 20),
      };
      products.push({ ...product, sheetRow: rowNumber, rowHash: hashRow(product) });

      if (imageRefs.length < imageCells.length) {
        errors.push({ rowNumber, sku, code: "BAD_IMAGE_LINK", message: `${imageCells.length - imageRefs.length} image link(s) could not be read and were ignored`, skipped: false });
      }
      if (video && !product.videoUrl) {
        errors.push({ rowNumber, sku, code: "BAD_VIDEO_LINK", message: "Video link must start with https:// and was ignored", skipped: false });
      }
    } catch (err) {
      if (!(err instanceof RowProblem)) throw err;
      errors.push({ rowNumber, sku, code: err.code, message: err.message, skipped: true });
    }
  });

  return { products, errors, dataRows, skipped: errors.filter((e) => e.skipped).length };
}
