import ExcelJS from "exceljs";
import { FIELDS, REQUIRED_FIELDS, TEMPLATE_HEADERS, type Field } from "./headers";

const EXAMPLES: Record<Field, string | number>[] = [
  {
    sku: "SK-1021",
    name: "Banarasi Silk Saree",
    catalogName: "Rangoli Vol-3",
    category: "Saree",
    fabric: "Pure Georgette",
    colours: "Red, Green, Blue",
    sizes: "",
    piecesPerSet: 4,
    price: 850,
    mrp: 1499,
    priceType: "Per piece",
    moq: "1 set",
    availableQty: 120,
    images: "https://drive.google.com/file/d/REPLACE_WITH_FILE_ID/view",
    videoUrl: "",
    description: "Soft georgette with zari border",
    gstPct: 5,
    active: "Yes",
    tags: "New Arrival, Wedding",
  },
  {
    sku: "KR-2040",
    name: "Cotton Printed Kurti",
    catalogName: "Summer Vol-1",
    category: "Kurti",
    fabric: "Cotton",
    colours: "Yellow, Pink",
    sizes: "M, L, XL, XXL",
    piecesPerSet: 4,
    price: 2400,
    mrp: "",
    priceType: "Per set",
    moq: "1 set",
    availableQty: 35,
    images: "https://drive.google.com/drive/folders/REPLACE_WITH_FOLDER_ID",
    videoUrl: "",
    description: "",
    gstPct: 5,
    active: "Yes",
    tags: "",
  },
];

const NOTES: Partial<Record<Field, string>> = {
  sku: "Unique code for each product. Used to match orders and stock.",
  catalogName: "Groups designs into a catalog, e.g. Rangoli Vol-3.",
  colours: "Comma separated.",
  sizes: "Comma separated. For kurti / readymade.",
  price: "Per piece or per set (see Price Type).",
  priceType: "Per piece or Per set.",
  moq: "Minimum order quantity.",
  availableQty: "Your stock. 0 = out of stock.",
  images: "Google Drive image links (comma separated) or ONE Drive folder link. Set sharing to \"Anyone with the link\".",
  active: "No = hidden from the catalog link.",
  tags: "Shown as badges, e.g. New Arrival.",
};

/** Builds the downloadable product sheet template (.xlsx). */
export async function buildTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CatalogLink";

  const ws = wb.addWorksheet("Products", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = FIELDS.map((f) => ({ header: TEMPLATE_HEADERS[f], key: f, width: f === "images" ? 48 : f === "name" || f === "description" ? 28 : 16 }));
  for (const ex of EXAMPLES) ws.addRow(ex);

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.height = 22;
  FIELDS.forEach((f, i) => {
    const cell = header.getCell(i + 1);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: REQUIRED_FIELDS.includes(f) ? "FFC2410C" : "FF57534E" } };
    if (NOTES[f]) cell.note = NOTES[f]!;
  });

  const col = (f: Field) => FIELDS.indexOf(f) + 1;
  for (let r = 2; r <= 1000; r++) {
    ws.getCell(r, col("active")).dataValidation = { type: "list", allowBlank: true, formulae: ['"Yes,No"'] };
    ws.getCell(r, col("priceType")).dataValidation = { type: "list", allowBlank: true, formulae: ['"Per piece,Per set"'] };
  }

  const help = wb.addWorksheet("How to use");
  help.columns = [{ width: 24 }, { width: 12 }, { width: 90 }];
  help.addRow(["CatalogLink product sheet"]).font = { bold: true, size: 14 };
  help.addRow([]);
  for (const line of [
    "1. Upload this file to Google Drive and open it with Google Sheets (File → Save as Google Sheets).",
    "2. One row = one product. Delete the two example rows and add your products.",
    "3. Upload product photos to Google Drive and paste the links in \"Image Links\".",
    "4. Connect the sheet in your CatalogLink dashboard and press Sync now.",
    "5. Change Available Qty any time; the catalog link updates on the next sync.",
  ]) help.addRow([line]);
  help.addRow([]);
  help.addRow(["Column", "Required", "Notes"]).font = { bold: true };
  for (const f of FIELDS) help.addRow([TEMPLATE_HEADERS[f], REQUIRED_FIELDS.includes(f) ? "Yes" : "No", NOTES[f] ?? ""]);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
