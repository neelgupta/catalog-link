// Generates local Google fixtures for development (used when GOOGLE_FAKE_DIR=./dev-fixtures/google).
// Run: pnpm --filter @cataloglink/core dev:fixtures
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { FIELDS, TEMPLATE_HEADERS } from "../src/sync/headers";

const dir = resolve(import.meta.dirname, "../../../dev-fixtures/google");
const file = (id: string) => `https://drive.google.com/file/d/${id}/view?usp=sharing`;
const folder = (id: string) => `https://drive.google.com/drive/folders/${id}?usp=sharing`;

const PHOTOS: Record<string, [string, string]> = {
  "demo-saree-red-0000001": ["#b91c1c", "Banarasi Red"],
  "demo-saree-green-000001": ["#15803d", "Banarasi Green"],
  "demo-georgette-blue-0001": ["#1d4ed8", "Georgette Blue"],
  "demo-kurti-yellow-00001": ["#ca8a04", "Kurti Yellow"],
  "demo-kurti-pink-0000001": ["#db2777", "Kurti Pink"],
  "demo-kurti-teal-0000001": ["#0f766e", "Kurti Teal"],
  "demo-lehenga-maroon-001": ["#7f1d1d", "Lehenga Maroon"],
  "demo-dressmat-purple-01": ["#6b21a8", "Dress Material"],
};
const FOLDERS = { "demo-folder-kurti-summer01": ["demo-kurti-yellow-00001", "demo-kurti-pink-0000001", "demo-kurti-teal-0000001"] };

type Row = Partial<Record<(typeof FIELDS)[number], string>>;
const rows: Row[] = [
  { sku: "SK-1021", name: "Banarasi Silk Saree", catalogName: "Rangoli Vol-3", category: "Saree", fabric: "Banarasi Silk", colours: "Red, Green", piecesPerSet: "4", price: "850", mrp: "1499", priceType: "Per piece", moq: "4", availableQty: "120", images: `${file("demo-saree-red-0000001")}, ${file("demo-saree-green-000001")}`, gstPct: "5", active: "Yes", tags: "New Arrival, Wedding", description: "Rich zari border, includes blouse piece." },
  { sku: "SK-1022", name: "Georgette Printed Saree", catalogName: "Rangoli Vol-3", category: "Saree", fabric: "Pure Georgette", colours: "Blue", price: "640", priceType: "Per piece", moq: "4", availableQty: "0", images: file("demo-georgette-blue-0001"), gstPct: "5", active: "Yes" },
  { sku: "KR-2040", name: "Cotton Printed Kurti", catalogName: "Summer Vol-1", category: "Kurti", fabric: "Cotton", colours: "Yellow, Pink, Teal", sizes: "M, L, XL, XXL", piecesPerSet: "4", price: "2400", priceType: "Per set", moq: "1 set", availableQty: "35", images: folder("demo-folder-kurti-summer01"), gstPct: "5", active: "Yes", tags: "New Arrival" },
  { sku: "LH-3001", name: "Bridal Lehenga", category: "Lehenga", fabric: "Velvet", colours: "Maroon", price: "7800", priceType: "Per piece", availableQty: "6", images: file("demo-lehenga-maroon-001"), gstPct: "12", active: "Yes", tags: "Wedding" },
  { sku: "DM-4100", name: "Unstitched Dress Material", category: "Dress Material", fabric: "Rayon", price: "450", availableQty: "80", images: file("demo-dressmat-purple-01"), active: "No" },
  // Rows with mistakes, to show the error report:
  { sku: "SK-1023", name: "Chiffon Saree (no price)", category: "Saree", availableQty: "40", images: file("demo-saree-red-0000001"), active: "Yes" },
  { sku: "SK-1021", name: "Duplicate of SK-1021", category: "Saree", price: "900", availableQty: "5", images: file("demo-saree-red-0000001"), active: "Yes" },
  { sku: "KR-2041", name: "Kurti with a broken photo link", category: "Kurti", price: "520", availableQty: "12", images: "IMG_2041.jpg", active: "Yes" },
];


// ── Sample catalog for `pnpm demo:data` (DEMO_catalog_sample_products) ──────────────────────────
// [sku, name, catalog, category, fabric, colours, sizes, piecesPerSet, price, mrp, priceType, moq, qty, gst, tags, active, images, pattern]
type Sample = [string, string, string, string, string, string, string, number, number, number, "Per piece" | "Per set", number, number, number, string, "Yes" | "No", number | "folder", Pattern];
type Pattern = "stripes" | "dots" | "checks" | "chevron" | "floral" | "plain";
const SAMPLES: Sample[] = [
  ["SR-1101", "Banarasi Silk Saree", "Rangoli Vol-3", "Saree", "Banarasi Silk", "Red, Green", "", 0, 850, 1499, "Per piece", 4, 120, 5, "New Arrival, Wedding", "Yes", 2, "floral"],
  ["SR-1102", "Kanjivaram Style Saree", "Rangoli Vol-3", "Saree", "Art Silk", "Purple, Gold", "", 0, 1150, 1899, "Per piece", 4, 60, 5, "Best Seller", "Yes", 2, "stripes"],
  ["SR-1103", "Georgette Printed Saree", "Rangoli Vol-3", "Saree", "Georgette", "Blue, Pink", "", 0, 640, 999, "Per piece", 4, 0, 5, "", "Yes", 2, "dots"],
  ["SR-1104", "Chiffon Floral Saree", "Rangoli Vol-3", "Saree", "Chiffon", "Peach", "", 0, 520, 899, "Per piece", 4, 4, 5, "", "Yes", 1, "floral"],
  ["SR-1105", "Organza Embroidered Saree", "Rangoli Vol-3", "Saree", "Organza", "Mint, Lavender", "", 0, 1380, 2299, "Per piece", 2, 45, 5, "New Arrival", "Yes", 2, "floral"],
  ["SR-1106", "Bandhani Gaji Silk Saree", "Festive Vol-2", "Saree", "Gaji Silk", "Red, Yellow", "", 0, 980, 1599, "Per piece", 2, 25, 5, "Festive", "Yes", 2, "dots"],
  ["SR-1201", "Cotton Daily Wear Saree", "Daily Wear Vol-5", "Saree", "Cotton", "Assorted", "", 6, 2100, 0, "Per set", 1, 30, 5, "Best Seller", "Yes", 1, "checks"],
  ["SR-1202", "Pure Linen Saree", "Daily Wear Vol-5", "Saree", "Linen", "Beige", "", 0, 760, 1199, "Per piece", 4, 50, 5, "", "Yes", 1, "stripes"],
  ["SR-1203", "Crepe Printed Saree", "Daily Wear Vol-5", "Saree", "Crepe", "Navy", "", 0, 430, 699, "Per piece", 6, 200, 5, "", "Yes", 1, "dots"],
  ["SR-1204", "Weightless Georgette Saree", "Daily Wear Vol-5", "Saree", "Weightless Georgette", "Assorted", "", 8, 2640, 0, "Per set", 1, 12, 5, "", "Yes", 1, "chevron"],
  ["SR-1301", "Bridal Banarasi Saree", "Bridal Edit 2026", "Saree", "Banarasi Silk", "Red", "", 0, 3200, 4999, "Per piece", 1, 15, 5, "Wedding", "Yes", 1, "floral"],
  ["KR-2101", "Cotton Printed Kurti", "Summer Vol-1", "Kurti", "Cotton", "Yellow, Pink, Teal", "M, L, XL, XXL", 4, 1800, 0, "Per set", 1, 35, 5, "New Arrival", "Yes", "folder", "floral"],
  ["KR-2102", "Rayon A-Line Kurti", "Summer Vol-1", "Kurti", "Rayon", "Mustard, Olive", "M, L, XL, XXL", 4, 1560, 0, "Per set", 1, 40, 5, "", "Yes", 2, "chevron"],
  ["KR-2103", "Lucknowi Chikankari Kurti", "Summer Vol-1", "Kurti", "Georgette", "White, Sky Blue", "M, L, XL, XXL", 4, 2600, 0, "Per set", 1, 3, 5, "New Arrival", "Yes", 2, "floral"],
  ["KR-2104", "Anarkali Kurti", "Summer Vol-1", "Kurti", "Rayon", "Maroon", "M, L, XL, XXL", 4, 2240, 0, "Per set", 1, 0, 5, "", "Yes", 1, "stripes"],
  ["KR-2105", "Straight Cut Kurti", "Summer Vol-1", "Kurti", "Cotton Slub", "Black", "S, M, L, XL, XXL", 5, 1650, 0, "Per set", 1, 70, 5, "Best Seller", "Yes", 1, "plain"],
  ["KR-2106", "Kurti with Palazzo", "Summer Vol-1", "Kurti", "Rayon", "Coral, Green", "M, L, XL, XXL", 4, 2880, 0, "Per set", 1, 22, 5, "", "Yes", 2, "checks"],
  ["LH-3101", "Bridal Velvet Lehenga", "Bridal Edit 2026", "Lehenga", "Velvet", "Maroon, Gold", "Free Size", 0, 7800, 12999, "Per piece", 1, 6, 12, "Wedding", "Yes", "folder", "floral"],
  ["LH-3102", "Net Embroidered Lehenga", "Bridal Edit 2026", "Lehenga", "Net", "Pink", "Free Size", 0, 5400, 8999, "Per piece", 1, 10, 12, "Wedding", "Yes", 1, "floral"],
  ["LH-3103", "Silk Lehenga Choli", "Bridal Edit 2026", "Lehenga", "Art Silk", "Royal Blue", "Free Size", 0, 4200, 6999, "Per piece", 1, 0, 12, "", "Yes", 1, "stripes"],
  ["LH-3104", "Sequin Party Lehenga", "Bridal Edit 2026", "Lehenga", "Georgette", "Wine", "Free Size", 0, 6300, 9999, "Per piece", 1, 8, 12, "New Arrival, Party Wear", "Yes", 2, "dots"],
  ["GW-4101", "Georgette Flared Gown", "Festive Vol-2", "Gown", "Georgette", "Bottle Green", "M, L, XL", 0, 1450, 2499, "Per piece", 3, 30, 5, "Party Wear", "Yes", 1, "chevron"],
  ["GW-4102", "Indo-Western Gown", "Festive Vol-2", "Gown", "Crepe", "Lilac", "M, L, XL", 0, 1650, 2799, "Per piece", 3, 18, 5, "New Arrival", "Yes", 1, "plain"],
  ["GW-4103", "Silk Anarkali Gown", "Festive Vol-2", "Gown", "Art Silk", "Mustard", "M, L, XL, XXL", 0, 1890, 2999, "Per piece", 3, 2, 5, "", "Yes", 1, "floral"],
  ["SS-5101", "Embroidered Salwar Suit", "Festive Vol-2", "Salwar Suit", "Cotton Silk", "Peach, Teal", "M, L, XL, XXL", 4, 3600, 0, "Per set", 1, 20, 5, "Festive", "Yes", 2, "floral"],
  ["SS-5102", "Pakistani Style Suit", "Festive Vol-2", "Salwar Suit", "Georgette", "White", "M, L, XL, XXL", 4, 4400, 0, "Per set", 1, 9, 5, "", "Yes", 1, "dots"],
  ["DM-6101", "Cotton Dress Material", "Daily Wear Vol-5", "Dress Material", "Cotton", "Assorted", "", 6, 2400, 0, "Per set", 1, 40, 5, "", "Yes", 1, "checks"],
  ["DM-6102", "Rayon Dress Material", "Daily Wear Vol-5", "Dress Material", "Rayon", "Purple", "", 0, 450, 750, "Per piece", 6, 80, 5, "", "Yes", 1, "chevron"],
  ["DM-6103", "Jam Cotton Dress Material", "Daily Wear Vol-5", "Dress Material", "Jam Cotton", "Orange", "", 0, 520, 850, "Per piece", 6, 0, 5, "", "Yes", 1, "stripes"],
  ["DP-7101", "Phulkari Dupatta", "", "Dupatta", "Chanderi", "Assorted", "", 0, 280, 499, "Per piece", 10, 150, 5, "", "Yes", 1, "floral"],
  ["DP-7102", "Banarasi Dupatta", "", "Dupatta", "Banarasi Silk", "Gold", "", 0, 390, 699, "Per piece", 10, 60, 5, "", "Yes", 1, "stripes"],
  ["DP-7103", "Chiffon Dupatta Set", "", "Dupatta", "Chiffon", "Assorted", "", 12, 1800, 0, "Per set", 1, 25, 5, "", "Yes", 1, "dots"],
  ["SR-1199", "Old Stock Printed Saree", "Rangoli Vol-2", "Saree", "Georgette", "Green", "", 0, 390, 0, "Per piece", 4, 14, 5, "", "No", 1, "dots"],
  ["KR-2199", "Discontinued Kurti", "Summer Vol-0", "Kurti", "Cotton", "Grey", "M, L, XL", 3, 900, 0, "Per set", 1, 5, 5, "", "No", 1, "plain"],
];

const COLOURS: Record<string, string> = {
  red: "#b91c1c", green: "#15803d", purple: "#6b21a8", gold: "#b8860b", blue: "#1d4ed8", pink: "#db2777", peach: "#f4a582",
  mint: "#5fb49c", lavender: "#9b87c9", yellow: "#ca8a04", beige: "#c8ad7f", navy: "#1e3a8a", teal: "#0f766e", mustard: "#c99a06",
  olive: "#6b7a2a", white: "#e7e5e4", "sky blue": "#38bdf8", maroon: "#7f1d1d", black: "#292524", coral: "#f2715a",
  "royal blue": "#2747b8", wine: "#722f37", "bottle green": "#14532d", lilac: "#b49bd6", orange: "#ea580c", grey: "#78716c",
  assorted: "#a21caf",
};

const PATTERNS: Record<Pattern, string> = {
  stripes: `<pattern id="p" width="60" height="60" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="22" height="60" fill="#ffffff2a"/></pattern>`,
  dots: `<pattern id="p" width="48" height="48" patternUnits="userSpaceOnUse"><circle cx="24" cy="24" r="8" fill="#ffffff40"/></pattern>`,
  checks: `<pattern id="p" width="80" height="80" patternUnits="userSpaceOnUse"><rect width="40" height="80" fill="#ffffff22"/><rect width="80" height="40" fill="#00000018"/></pattern>`,
  chevron: `<pattern id="p" width="60" height="40" patternUnits="userSpaceOnUse"><path d="M0 30 L30 10 L60 30" stroke="#ffffff40" stroke-width="8" fill="none"/></pattern>`,
  floral: `<pattern id="p" width="90" height="90" patternUnits="userSpaceOnUse"><g fill="#ffffff38"><circle cx="45" cy="30" r="12"/><circle cx="30" cy="45" r="12"/><circle cx="60" cy="45" r="12"/><circle cx="45" cy="60" r="12"/></g><circle cx="45" cy="45" r="7" fill="#fde68a88"/></pattern>`,
  plain: `<pattern id="p" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#ffffff08"/></pattern>`,
};

const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const sampleSvg = (color: string, pattern: Pattern, title: string, subtitle: string) => `
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800">
  <defs>${PATTERNS[pattern]}<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff22"/><stop offset="1" stop-color="#00000055"/></linearGradient></defs>
  <rect width="100%" height="100%" fill="${color}"/>
  <rect width="100%" height="100%" fill="url(#p)"/>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <rect x="0" y="640" width="600" height="160" fill="#00000066"/>
  <text x="300" y="705" font-family="sans-serif" font-size="40" font-weight="bold" fill="#fff" text-anchor="middle">${escapeXml(title)}</text>
  <text x="300" y="755" font-family="sans-serif" font-size="30" fill="#ffffffcc" text-anchor="middle">${escapeXml(subtitle)}</text>
</svg>`;

async function writeSampleCatalog() {
  const folders: Record<string, string[]> = { ...FOLDERS };
  const sampleRows: Row[] = [];
  for (const [sku, name, catalogName, category, fabric, colours, sizes, pieces, price, mrp, priceType, moq, qty, gst, tags, active, images, pattern] of SAMPLES) {
    const colourList = colours.split(",").map((c) => c.trim());
    const count = images === "folder" ? 3 : images;
    const ids = Array.from({ length: count }, (_, i) => `demo-${sku.toLowerCase()}-${i + 1}`);
    for (const [i, id] of ids.entries()) {
      const colour = colourList[i % colourList.length]!;
      const label = `${sku} · ${colour}${count > 1 ? ` · ${i + 1}/${count}` : ""}`;
      const jpg = await sharp(Buffer.from(sampleSvg(COLOURS[colour.toLowerCase()] ?? "#57534e", pattern, name, label))).jpeg({ quality: 72 }).toBuffer();
      await writeFile(join(dir, "drive", "files", `${id}.jpg`), jpg);
    }
    let imageCell = ids.map(file).join(", ");
    if (images === "folder") {
      const folderId = `demo-folder-${sku.toLowerCase()}`;
      folders[folderId] = ids;
      imageCell = folder(folderId);
    }
    sampleRows.push({
      sku, name, catalogName, category, fabric, colours, sizes,
      piecesPerSet: pieces ? String(pieces) : "", price: String(price), mrp: mrp ? String(mrp) : "", priceType,
      moq: String(moq), availableQty: String(qty), images: imageCell, gstPct: String(gst), active, tags,
      description: `${fabric} ${category.toLowerCase()} from our ${catalogName || "regular"} range.${pieces ? ` ${pieces} pieces per set.` : ""} Ships from Surat in 2–3 days.`,
    });
  }
  await writeFile(join(dir, "drive", "folders.json"), JSON.stringify(folders, null, 2));
  const header = FIELDS.map((f) => TEMPLATE_HEADERS[f]);
  await writeFile(
    join(dir, "sheets", "DEMO_catalog_sample_products.json"),
    JSON.stringify({ title: "Sample Products – CatalogLink demo", tabs: { Products: [header, ...sampleRows.map((r) => FIELDS.map((f) => r[f] ?? ""))] } }, null, 2),
  );
}

const svg = (color: string, label: string) => `
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200">
  <rect width="100%" height="100%" fill="${color}"/>
  <path d="M0 0 L900 1200 M900 0 L0 1200" stroke="#ffffff22" stroke-width="40"/>
  <text x="50%" y="50%" font-family="sans-serif" font-size="72" fill="#fff" text-anchor="middle">${label}</text>
</svg>`;

await rm(dir, { recursive: true, force: true });
await mkdir(join(dir, "sheets"), { recursive: true });
await mkdir(join(dir, "drive", "files"), { recursive: true });

for (const [id, [color, label]] of Object.entries(PHOTOS)) {
  await writeFile(join(dir, "drive", "files", `${id}.jpg`), await sharp(Buffer.from(svg(color, label))).jpeg({ quality: 80 }).toBuffer());
}
await writeFile(join(dir, "drive", "folders.json"), JSON.stringify(FOLDERS, null, 2));

const header = FIELDS.map((f) => TEMPLATE_HEADERS[f]);
await writeFile(
  join(dir, "sheets", "DEMO_shree_krishna_textiles_sheet.json"),
  JSON.stringify({ title: "Shree Krishna Textiles – Products", tabs: { Products: [header, ...rows.map((r) => FIELDS.map((f) => r[f] ?? ""))], Notes: [["Not a products tab"]] } }, null, 2),
);
await writeSampleCatalog();
await writeFile(join(dir, "sheets", "DEMO_sheet_without_access_xx.json"), JSON.stringify({ title: "Private sheet", error: 403 }, null, 2));
console.log(`Wrote fixtures to ${dir}`);
