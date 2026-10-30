import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { type CellValue, type DriveFile, type GoogleSource, GoogleError } from "./source";

/**
 * DEVELOPMENT ONLY: a GoogleSource that reads local fixture files, so the sync flow can be
 * exercised without Google credentials. Enabled by GOOGLE_FAKE_DIR; refused in production.
 *
 * Layout:
 *   <dir>/sheets/<spreadsheetId>.json   { "title": "...", "tabs": { "Products": [["header", ...], [...]] } }
 *                                       or { "error": 403 } to simulate a failure
 *   <dir>/drive/folders.json            { "<folderId>": ["<fileId>", ...] }
 *   <dir>/drive/files/<fileId>.<ext>    image bytes (png/jpg/webp)
 *   <dir>/.writes/<spreadsheetId>.json  tabs CatalogLink wrote (e.g. "Orders"); kept apart so the
 *                                       fixtures themselves never change (git-ignored)
 */
export class FakeGoogleSource implements GoogleSource {
  constructor(private readonly dir: string) {
    if (process.env.NODE_ENV === "production") throw new Error("FakeGoogleSource is not allowed in production");
  }

  private sheet(spreadsheetId: string) {
    if (!/^[\w-]+$/.test(spreadsheetId)) throw new GoogleError("not_found", "Spreadsheet not found", 404);
    let json: { title?: string; tabs?: Record<string, string[][]>; error?: number };
    try {
      json = JSON.parse(readFileSync(join(this.dir, "sheets", `${spreadsheetId}.json`), "utf8"));
    } catch {
      throw new GoogleError("not_found", "The spreadsheet, tab or file was not found.", 404);
    }
    if (json.error === 403) throw new GoogleError("no_access", "CatalogLink doesn't have access to this spreadsheet.", 403);
    if (json.error) throw new GoogleError("unavailable", "Google is temporarily unavailable.", json.error);
    return { title: json.title ?? spreadsheetId, tabs: { ...(json.tabs ?? {}), ...this.written(spreadsheetId) } };
  }

  private writesFile(spreadsheetId: string) {
    return join(this.dir, ".writes", `${spreadsheetId}.json`);
  }

  private written(spreadsheetId: string): Record<string, string[][]> {
    try {
      return JSON.parse(readFileSync(this.writesFile(spreadsheetId), "utf8"));
    } catch {
      return {};
    }
  }

  private write(spreadsheetId: string, tab: string, change: (rows: string[][]) => void) {
    this.sheet(spreadsheetId); // access check
    const all = this.written(spreadsheetId);
    const rows = (all[tab] ??= []);
    change(rows);
    mkdirSync(join(this.dir, ".writes"), { recursive: true });
    writeFileSync(this.writesFile(spreadsheetId), JSON.stringify(all, null, 2));
  }

  async ensureTab(spreadsheetId: string, tab: string, headers: string[]) {
    if (this.sheet(spreadsheetId).tabs[tab]?.length) return;
    this.write(spreadsheetId, tab, (rows) => rows.push(headers));
  }

  async appendRows(spreadsheetId: string, tab: string, rows: CellValue[][]) {
    this.write(spreadsheetId, tab, (existing) => existing.push(...rows.map((r) => r.map(String))));
  }

  async updateCells(spreadsheetId: string, tab: string, updates: { range: string; values: CellValue[][] }[]) {
    this.write(spreadsheetId, tab, (rows) => {
      for (const u of updates) {
        const { row, col } = parseA1(u.range);
        u.values.forEach((values, i) => {
          const target = (rows[row + i] ??= []);
          values.forEach((v, j) => (target[col + j] = String(v)));
        });
      }
    });
  }

  async getSpreadsheet(spreadsheetId: string) {
    const s = this.sheet(spreadsheetId);
    // Tab ids follow Google's pattern: the first tab is gid 0.
    const tabs = Object.keys(s.tabs);
    return { id: spreadsheetId, title: s.title, tabs, tabIds: tabs.map((_, i) => i) };
  }

  async readValues(spreadsheetId: string, tab: string) {
    const values = this.sheet(spreadsheetId).tabs[tab];
    if (!values) throw new GoogleError("not_found", `Tab "${tab}" not found`, 404);
    return values.map((r) => r.map((c) => (c === null || c === undefined ? "" : String(c))));
  }

  async listSpreadsheets() {
    return readdirSync(join(this.dir, "sheets"))
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        const id = f.slice(0, -5);
        try {
          return { id, name: this.sheet(id).title, modifiedTime: null };
        } catch {
          return { id, name: id, modifiedTime: null };
        }
      });
  }

  private files() {
    try {
      return readdirSync(join(this.dir, "drive", "files"));
    } catch {
      return [];
    }
  }

  async listFolderImages(folderId: string) {
    let folders: Record<string, string[]> = {};
    try {
      folders = JSON.parse(readFileSync(join(this.dir, "drive", "folders.json"), "utf8"));
    } catch {
      /* no folders */
    }
    const ids = folders[folderId];
    if (!ids) throw new GoogleError("not_found", "Folder not found", 404);
    return Promise.all(ids.map((id) => this.getFile(id)));
  }

  async getFile(fileId: string): Promise<DriveFile> {
    const name = this.files().find((f) => f.slice(0, -extname(f).length) === fileId);
    if (!name) throw new GoogleError("not_found", "File not found", 404);
    const ext = extname(name).slice(1).toLowerCase();
    const size = readFileSync(join(this.dir, "drive", "files", name)).length;
    return { id: fileId, name, mimeType: ext === "jpg" ? "image/jpeg" : `image/${ext}`, modifiedTime: "2026-01-01T00:00:00.000Z", size };
  }

  async download(fileId: string) {
    const file = await this.getFile(fileId);
    return readFileSync(join(this.dir, "drive", "files", file.name));
  }
}

/** "B5" or "B5:C5" → zero-based start row/column. */
function parseA1(range: string) {
  const m = range.match(/^([A-Z]+)(\d+)/);
  if (!m) throw new Error(`Unsupported range ${range}`);
  const col = [...m[1]!].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  return { row: Number(m[2]) - 1, col };
}
