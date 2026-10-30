import { randomInt, randomUUID } from "node:crypto";
import { prisma } from "@cataloglink/db";
import ExcelJS from "exceljs";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClient, deleteClient } from "../clients";
import { processImage } from "../images/process";
import { createPlan } from "../plans";
import { getStorage } from "../storage";
import { type DriveFile, type GoogleSource, GoogleError } from "../google/source";
import { FIELDS, mapHeaders, TEMPLATE_HEADERS } from "./headers";
import { runSync } from "./run";
import { buildTemplate } from "./template";

/** In-memory Google: one spreadsheet, some Drive files and folders, and switchable failures. */
class MemorySource implements GoogleSource {
  values: string[][] = [];
  folders = new Map<string, string[]>();
  files = new Map<string, { data: Buffer; modifiedTime: string; mimeType?: string }>();
  fail: GoogleError | null = null;
  calls = { readValues: 0, listFolderImages: 0, download: 0 };

  private check() {
    if (this.fail) throw this.fail;
  }
  async getSpreadsheet(id: string) {
    this.check();
    return { id, title: "Test", tabs: ["Products"], tabIds: [0] };
  }
  async readValues() {
    this.check();
    this.calls.readValues++;
    return this.values.map((r) => [...r]);
  }
  async ensureTab() {}
  async appendRows() {}
  async updateCells() {}
  async listSpreadsheets() {
    return [];
  }
  async listFolderImages(folderId: string) {
    this.check();
    this.calls.listFolderImages++;
    const ids = this.folders.get(folderId);
    if (!ids) throw new GoogleError("not_found", "Folder not found", 404);
    return Promise.all(ids.map((id) => this.getFile(id)));
  }
  async getFile(fileId: string): Promise<DriveFile> {
    this.check();
    const f = this.files.get(fileId);
    if (!f) throw new GoogleError("not_found", "File not found", 404);
    return { id: fileId, name: `${fileId}.png`, mimeType: f.mimeType ?? "image/png", modifiedTime: f.modifiedTime, size: f.data.length };
  }
  async download(fileId: string) {
    this.check();
    this.calls.download++;
    return this.files.get(fileId)!.data;
  }
}

const HEADER = FIELDS.map((f) => TEMPLATE_HEADERS[f]);
const fileUrl = (id: string) => `https://drive.google.com/file/d/${id}/view`;
const folderUrl = (id: string) => `https://drive.google.com/drive/folders/${id}`;
function row(v: Partial<Record<(typeof FIELDS)[number], string>>) {
  const base = { name: "Saree", category: "Saree", price: "850", availableQty: "10", active: "Yes", ...v };
  return FIELDS.map((f) => base[f as keyof typeof base] ?? "");
}

const run = randomUUID().slice(0, 6);
let clientId: string;
let source: MemorySource;
let png: Buffer;

describe("sheet sync (Postgres)", () => {
  beforeAll(async () => {
    const plan = await createPlan({ name: `Sync ${run}`, maxProducts: 5, maxCustomLinks: 1, maxStaff: 0, maxOrdersPerMonth: 10, price: 0, durationDays: 30, isActive: true });
    const c = await createClient({
      businessName: `Sync Test ${run}`, ownerName: "O", mobile: `9${randomInt(100_000_000, 999_999_999)}`, email: `sync-${run}@test.local`,
      city: "Surat", password: "password-123", planId: plan.id, trialDays: 0, gst: undefined, address: undefined,
    });
    clientId = c.id;
    await prisma.sheetConnection.create({ data: { clientId, mode: "SERVICE_ACCOUNT", spreadsheetId: "sheet-1", sheetName: "Products" } });
    png = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#c2410c" } }).png().toBuffer();
  });

  beforeEach(() => {
    source = new MemorySource();
    source.files.set("img-a-1234567890", { data: png, modifiedTime: "2026-10-01T00:00:00Z" });
    source.files.set("img-b-1234567890", { data: png, modifiedTime: "2026-10-01T00:00:00Z" });
    source.files.set("img-c-1234567890", { data: png, modifiedTime: "2026-10-01T00:00:00Z" });
    source.folders.set("folder-1234567890", ["img-b-1234567890", "img-c-1234567890"]);
  });

  afterAll(async () => {
    await deleteClient(clientId);
    await prisma.plan.deleteMany({ where: { name: `Sync ${run}` } });
    await prisma.$disconnect();
  });

  const products = () =>
    prisma.product.findMany({ where: { clientId }, orderBy: { sku: "asc" }, include: { images: { orderBy: { position: "asc" } } } });

  it("imports valid rows, reports bad ones and queues images", async () => {
    source.values = [
      HEADER,
      row({ sku: "A", images: fileUrl("img-a-1234567890"), tags: "New Arrival" }),
      row({ sku: "B", images: folderUrl("folder-1234567890"), priceType: "Per set" }),
      row({ sku: "C", images: fileUrl("img-a-1234567890"), price: "" }),
    ];
    const queued: string[] = [];
    let changed = 0;
    const result = await runSync(clientId, "MANUAL", { source, enqueueImages: async (ids) => void queued.push(...ids), onCatalogChanged: async () => void changed++ });

    expect(result.status).toBe("PARTIAL");
    const ps = await products();
    expect(ps.map((p) => p.sku)).toEqual(["A", "B"]);
    expect(ps[1]!.images.map((i) => i.driveFileId)).toEqual(["img-b-1234567890", "img-c-1234567890"]);
    expect(ps[1]!.priceType).toBe("SET");
    expect(queued).toHaveLength(3);
    expect(changed).toBe(1);

    const runRow = await prisma.syncRun.findUniqueOrThrow({ where: { id: result.runId! }, include: { rowErrors: true } });
    expect(runRow).toMatchObject({ rowsTotal: 3, rowsAdded: 2, rowsUpdated: 0, rowsSkipped: 1, rowsRemoved: 0 });
    expect(runRow.rowErrors).toEqual([expect.objectContaining({ rowNumber: 4, sku: "C", code: "MISSING_PRICE" })]);
    expect((await prisma.sheetConnection.findUniqueOrThrow({ where: { clientId } })).lastStatus).toBe("PARTIAL");
  });

  it("makes WebP thumbnails for queued images, and skips unchanged files next time", async () => {
    const pending = await prisma.productImage.findMany({ where: { clientId, status: "PENDING" } });
    for (const img of pending) expect(await processImage(img.id, source)).toBe("ready");
    const img = await prisma.productImage.findFirstOrThrow({ where: { clientId, driveFileId: "img-a-1234567890" } });
    expect(img.thumbUrl).toMatch(/^\/media\/clients\/.+-400\.webp$/);
    expect(img.blurDataUrl).toMatch(/^data:image\/webp;base64,/);
    const thumb = await getStorage().read(getStorage().keyFromUrl(img.thumbUrl!)!);
    expect((await sharp(thumb!).metadata()).width).toBe(400);
    const full = await getStorage().read(getStorage().keyFromUrl(img.fullUrl!)!);
    expect((await sharp(full!).metadata()).width).toBe(1200);

    const downloads = source.calls.download;
    expect(await processImage(img.id, source)).toBe("skipped");
    expect(source.calls.download).toBe(downloads);
  });

  it("updates only changed rows, follows moved rows, and soft-hides removed SKUs", async () => {
    source.values = [
      HEADER,
      row({}), // blank-ish? no: it has defaults, but no SKU -> skipped
      row({ sku: "B", images: folderUrl("folder-1234567890"), priceType: "Per set" }), // moved from row 3 to row 3? (same content)
      row({ sku: "A", images: fileUrl("img-a-1234567890"), tags: "New Arrival", availableQty: "0" }), // qty changed
    ];
    const result = await runSync(clientId, "AUTO", { source });
    const runRow = await prisma.syncRun.findUniqueOrThrow({ where: { id: result.runId! } });
    expect(runRow).toMatchObject({ rowsAdded: 0, rowsUpdated: 1, rowsRemoved: 0 });
    const a = (await products()).find((p) => p.sku === "A")!;
    expect(a.availableQty).toBe(0);
    expect(a.sheetRow).toBe(4);
    expect(a.images[0]!.status).toBe("READY"); // same Drive file: thumbnail kept
    expect(source.calls.listFolderImages).toBe(0); // AUTO sync doesn't re-read folders of unchanged rows

    source.values = [HEADER, row({ sku: "A", images: fileUrl("img-a-1234567890"), tags: "New Arrival", availableQty: "0" })];
    await runSync(clientId, "AUTO", { source });
    const b = (await products()).find((p) => p.sku === "B")!;
    expect(b.removedFromSheetAt).not.toBeNull();
    expect(b.images).toHaveLength(2); // kept, product is only hidden

    source.values = [HEADER, row({ sku: "A", images: fileUrl("img-a-1234567890"), tags: "New Arrival", availableQty: "0" }), row({ sku: "B", images: folderUrl("folder-1234567890"), priceType: "Per set" })];
    await runSync(clientId, "AUTO", { source });
    expect((await products()).find((p) => p.sku === "B")!.removedFromSheetAt).toBeNull();
  });

  it("keeps the last good data when a row becomes invalid", async () => {
    source.values = [HEADER, row({ sku: "A", images: fileUrl("img-a-1234567890"), price: "" }), row({ sku: "B", images: folderUrl("folder-1234567890"), priceType: "Per set" })];
    await runSync(clientId, "AUTO", { source });
    const a = (await products()).find((p) => p.sku === "A")!;
    expect(a.removedFromSheetAt).toBeNull();
    expect(a.price.toString()).toBe("850");
  });

  it("never touches products when Google fails", async () => {
    const before = JSON.stringify(await products());
    for (const fail of [new GoogleError("unavailable", "down", 503), new GoogleError("no_access", "forbidden", 403), new GoogleError("auth", "revoked", 401)]) {
      source.values = [HEADER]; // would remove everything if it were read
      source.fail = fail;
      const result = await runSync(clientId, "AUTO", { source });
      expect(result.status).toBe("FAILED");
      expect(result.transient).toBe(fail.kind === "unavailable");
      expect(JSON.stringify(await products())).toBe(before);
    }
    const last = await prisma.syncRun.findFirstOrThrow({ where: { clientId }, orderBy: { startedAt: "desc" } });
    expect(last.status).toBe("FAILED");
    expect(last.errorMessage).toMatch(/reconnect/i);
  });

  it("fails clearly on missing columns without touching products", async () => {
    const before = await prisma.product.count({ where: { clientId, removedFromSheetAt: null } });
    source.values = [["SKU", "Name"], ["A", "x"]];
    const result = await runSync(clientId, "AUTO", { source });
    expect(result).toMatchObject({ status: "FAILED", transient: false });
    expect(result.message).toContain('"Category"');
    expect(await prisma.product.count({ where: { clientId, removedFromSheetAt: null } })).toBe(before);
  });

  it("re-reads image folders on a manual sync and drops images removed from the folder", async () => {
    source.values = [HEADER, row({ sku: "A", images: fileUrl("img-a-1234567890"), price: "850", tags: "New Arrival", availableQty: "0" }), row({ sku: "B", images: folderUrl("folder-1234567890"), priceType: "Per set" })];
    source.folders.set("folder-1234567890", ["img-c-1234567890"]);
    await runSync(clientId, "MANUAL", { source });
    expect(source.calls.listFolderImages).toBe(1);
    const b = (await products()).find((p) => p.sku === "B")!;
    expect(b.images.map((i) => i.driveFileId)).toEqual(["img-c-1234567890"]);
    expect(b.images[0]!.position).toBe(0);
  });

  it("caps imports at the plan's product limit", async () => {
    source.values = [HEADER, ...["A", "B", "C", "D", "E", "F", "G"].map((sku) => row({ sku, images: fileUrl("img-a-1234567890") }))];
    const result = await runSync(clientId, "AUTO", { source });
    const errors = await prisma.syncRowError.findMany({ where: { syncRunId: result.runId! } });
    expect(errors.map((e) => e.code)).toEqual(["PLAN_LIMIT", "PLAN_LIMIT"]);
    expect(await prisma.product.count({ where: { clientId, removedFromSheetAt: null } })).toBe(5);
  });

  it("marks inaccessible or non-image Drive files as failed with a reason", async () => {
    source.values = [HEADER, row({ sku: "X", images: `${fileUrl("missing-1234567890")}, ${fileUrl("doc-file-1234567890")}` })];
    source.files.set("doc-file-1234567890", { data: Buffer.from("%PDF"), modifiedTime: "2026-10-01T00:00:00Z", mimeType: "application/pdf" });
    await runSync(clientId, "AUTO", { source });
    const x = (await products()).find((p) => p.sku === "X")!;
    expect(await processImage(x.images[0]!.id, source)).toBe("failed");
    expect(await processImage(x.images[1]!.id, source)).toBe("failed");
    const [missing, doc] = await prisma.productImage.findMany({ where: { productId: x.id }, orderBy: { position: "asc" } });
    expect(missing!.error).toMatch(/not accessible/);
    expect(doc!.error).toMatch(/not an image/);
  });
});

describe("sheet template", () => {
  it("has every column, maps cleanly and its example rows pass validation", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildTemplate()) as never);
    const ws = wb.getWorksheet("Products")!;
    const header = (ws.getRow(1).values as unknown[]).slice(1).map(String);
    const { missing, unknown } = mapHeaders(header);
    expect(missing).toEqual([]);
    expect(unknown).toEqual([]);
    expect(ws.actualRowCount).toBe(3);
  });
});
