import { drive as driveApi } from "@googleapis/drive";
import { sheets as sheetsApi } from "@googleapis/sheets";
import type { GoogleAuth, OAuth2Client } from "google-auth-library";
import { type DriveFile, type GoogleSource, GoogleError, toGoogleError } from "./source";

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
      const { data } = await this.sheets.spreadsheets.get({ spreadsheetId, fields: "properties.title,sheets.properties.title" });
      return {
        id: spreadsheetId,
        title: data.properties?.title ?? "Untitled spreadsheet",
        tabs: (data.sheets ?? []).map((s) => s.properties?.title ?? "").filter(Boolean),
      };
    });
  }

  readValues(spreadsheetId: string, tab: string) {
    return call(async () => {
      const { data } = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${tab.replace(/'/g, "''")}'`,
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
