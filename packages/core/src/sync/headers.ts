/** Product fields read from the sheet. */
export const FIELDS = [
  "sku",
  "name",
  "catalogName",
  "category",
  "fabric",
  "colours",
  "sizes",
  "piecesPerSet",
  "price",
  "mrp",
  "priceType",
  "moq",
  "availableQty",
  "images",
  "videoUrl",
  "description",
  "gstPct",
  "active",
  "tags",
] as const;
export type Field = (typeof FIELDS)[number];

export const REQUIRED_FIELDS: Field[] = ["sku", "name", "category", "price", "availableQty", "images", "active"];

/** Column titles in the downloadable template, in order. */
export const TEMPLATE_HEADERS: Record<Field, string> = {
  sku: "Product Code / SKU",
  name: "Product Name",
  catalogName: "Catalog Name",
  category: "Category",
  fabric: "Fabric",
  colours: "Colours / Variants",
  sizes: "Sizes",
  piecesPerSet: "Pieces per Set",
  price: "Wholesale Price (₹)",
  mrp: "MRP (₹)",
  priceType: "Price Type",
  moq: "MOQ",
  availableQty: "Available Qty",
  images: "Image Links",
  videoUrl: "Video Link",
  description: "Description",
  gstPct: "GST %",
  active: "Active (Yes/No)",
  tags: "Tags",
};

/** "Wholesale Price (₹)" -> "wholesale price" */
export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/₹|\brs\b\.?|\binr\b/g, " ")
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9%/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ALIASES: Record<Field, string[]> = {
  sku: ["product code / sku", "product code", "sku", "design no", "design number", "code", "item code"],
  name: ["product name", "name", "design name", "item name", "title"],
  catalogName: ["catalog name", "catalog", "catalogue", "catalogue name"],
  category: ["category", "type", "product type"],
  fabric: ["fabric", "material"],
  colours: ["colours / variants", "colours", "colors", "colour", "color", "variants"],
  sizes: ["sizes", "size"],
  piecesPerSet: ["pieces per set", "pcs per set", "set pcs", "pieces", "pcs in set"],
  price: ["wholesale price", "price", "rate", "wholesale rate"],
  mrp: ["mrp"],
  priceType: ["price type", "rate type"],
  moq: ["moq", "min order qty", "minimum order qty", "minimum order quantity"],
  availableQty: ["available qty", "qty", "stock", "quantity", "available quantity", "available stock"],
  images: ["image links", "images", "image", "photos", "image link", "photo links"],
  videoUrl: ["video link", "video", "video url"],
  description: ["description", "details"],
  gstPct: ["gst %", "gst", "gst percent", "tax %"],
  active: ["active", "show", "active yes/no", "visible"],
  tags: ["tags", "badges", "tag"],
};

const LOOKUP = new Map<string, Field>();
for (const field of FIELDS) {
  LOOKUP.set(normalizeHeader(TEMPLATE_HEADERS[field]), field);
  for (const alias of ALIASES[field]) LOOKUP.set(normalizeHeader(alias), field);
}

export type HeaderMap = Partial<Record<Field, number>>;

/** Maps header cells to fields (first matching column wins) and lists missing required fields. */
export function mapHeaders(headerRow: readonly string[]) {
  const map: HeaderMap = {};
  const unknown: string[] = [];
  headerRow.forEach((cell, index) => {
    if (!cell?.trim()) return;
    const field = LOOKUP.get(normalizeHeader(cell));
    if (field === undefined) unknown.push(cell.trim());
    else if (map[field] === undefined) map[field] = index;
  });
  const missing = REQUIRED_FIELDS.filter((f) => map[f] === undefined);
  return { map, missing, unknown };
}

export function describeMissing(missing: Field[]) {
  return missing.map((f) => `"${TEMPLATE_HEADERS[f]}"`).join(", ");
}
