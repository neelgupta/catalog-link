import { drive as driveApi } from "@googleapis/drive";
import { sheets as sheetsApi } from "@googleapis/sheets";
import type { GoogleAuth, OAuth2Client } from "google-auth-library";
import { type CellValue, type DriveFile, type GoogleSource, GoogleError, toGoogleError } from "./source";

/** A tab name in A1 notation ('My tab'). */
const quoteTab = (tab: string) => `'${tab.replace(/'/g, "''")}'`;

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const FILE_FIELDS = "id,name,mimeType,modifiedTime,size";

function toDriveFile(f: { id?: string | null; name?: string | null; mimeType?: string | null; modifiedTime?: string | null; size?: string | null }): DriveFile {
  return {
    id: f.id ?? "",
    name: f.name ?? "",
    mimeType: f.mimeType ?? "",
    modifiedTime: f.modifiedTime ?? null,
    size: f.size ? Number(f.size) : null,
  };
}

async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw toGoogleError(err);
  }
}

/** GoogleSource backed by the real Sheets v4 and Drive v3 APIs. */
export class ApiGoogleSource implements GoogleSource {
  private readonly sheets;
  private readonly drive;

  constructor(auth: OAuth2Client | GoogleAuth) {
    this.sheets = sheetsApi({ version: "v4", auth });
    this.drive = driveApi({ version: "v3", auth });
  }

  getSpreadsheet(spreadsheetId: string) {
    return call(async () => {
      const { data } = await this.sheets.spreadsheets.get({ spreadsheetId, fields: "properties.title,sheets.properties(title,sheetId)" });
      const sheets = (data.sheets ?? []).filter((s) => s.properties?.title);
      return {
        id: spreadsheetId,
        title: data.properties?.title ?? "Untitled spreadsheet",
        tabs: sheets.map((s) => s.properties!.title!),
        tabIds: sheets.map((s) => s.properties!.sheetId ?? -1),
      };
    });
  }

  readValues(spreadsheetId: string, tab: string) {
    return call(async () => {
      const { data } = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: quoteTab(tab),
        majorDimension: "ROWS",
        valueRenderOption: "FORMATTED_VALUE",
      });
      return (data.values ?? []).map((row) => row.map((c) => (c === null || c === undefined ? "" : String(c))));
    });
  }

  listSpreadsheets() {
    return call(async () => {
      const { data } = await this.drive.files.list({
        q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
        orderBy: "modifiedTime desc",
        pageSize: 50,
        fields: "files(id,name,modifiedTime)",
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
      });
      return (data.files ?? []).map((f) => ({ id: f.id ?? "", name: f.name ?? "", modifiedTime: f.modifiedTime ?? null }));
    });
  }

  listFolderImages(folderId: string) {
    return call(async () => {
      const files: DriveFile[] = [];
      let pageToken: string | undefined;
      do {
        const { data } = await this.drive.files.list({
          q: `'${folderId.replace(/'/g, "")}' in parents and mimeType contains 'image/' and trashed=false`,
          orderBy: "name",
          pageSize: 100,
          pageToken,
          fields: `nextPageToken,files(${FILE_FIELDS})`,
          includeItemsFromAllDrives: true,
          supportsAllDrives: true,
        });
        files.push(...(data.files ?? []).map(toDriveFile));
        pageToken = data.nextPageToken ?? undefined;
      } while (pageToken && files.length < 50);
      return files.slice(0, 50);
    });
  }

  async ensureTab(spreadsheetId: string, tab: string, headers: string[]) {
    const info = await this.getSpreadsheet(spreadsheetId);
    if (!info.tabs.includes(tab)) {
      await call(() => this.sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title: tab } } }] } }));
    } else if ((await this.readValues(spreadsheetId, tab)).length > 0) {
      return;
    }
    await this.updateCells(spreadsheetId, tab, [{ range: "A1", values: [headers] }]);
  }

  async appendRows(spreadsheetId: string, tab: string, rows: CellValue[][]) {
    await call(() =>
      this.sheets.spreadsheets.values.append({
        spreadsheetId,
        range: quoteTab(tab),
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: rows },
      }),
    );
  }

  async updateCells(spreadsheetId: string, tab: string, updates: { range: string; values: CellValue[][] }[]) {
    if (!updates.length) return;
    await call(() =>
      this.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: { valueInputOption: "RAW", data: updates.map((u) => ({ range: `${quoteTab(tab)}!${u.range}`, values: u.values })) },
      }),
    );
  }

  getFile(fileId: string) {
    return call(async () => toDriveFile((await this.drive.files.get({ fileId, fields: FILE_FIELDS, supportsAllDrives: true })).data));
  }

  download(fileId: string) {
    return call(async () => {
      const res = await this.drive.files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" });
      const data = Buffer.from(res.data as ArrayBuffer);
      if (data.length > MAX_IMAGE_BYTES) throw new GoogleError("unknown", "Image is larger than 20 MB");
      return data;
    });
  }
}
