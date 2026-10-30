export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string | null;
  size: number | null;
};

export type SpreadsheetInfo = { id: string; title: string; tabs: string[] };

/** Everything CatalogLink needs from Google, behind one interface (real API or dev fixtures). */
export interface GoogleSource {
  getSpreadsheet(spreadsheetId: string): Promise<SpreadsheetInfo>;
  /** All cells of a tab as display strings, header row first. */
  readValues(spreadsheetId: string, tab: string): Promise<string[][]>;
  /** Spreadsheets visible to the connected account (OAuth only). */
  listSpreadsheets(): Promise<{ id: string; name: string; modifiedTime: string | null }[]>;
  listFolderImages(folderId: string): Promise<DriveFile[]>;
  getFile(fileId: string): Promise<DriveFile>;
  download(fileId: string): Promise<Buffer>;
}

/** Why a Google call failed, in terms the client can act on. */
export type GoogleErrorKind = "no_access" | "not_found" | "auth" | "rate_limited" | "unavailable" | "unknown";

export class GoogleError extends Error {
  constructor(
    readonly kind: GoogleErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GoogleError";
  }

  /** Worth retrying later without any change by the client. */
  get transient() {
    return this.kind === "rate_limited" || this.kind === "unavailable";
  }
}

export const GOOGLE_ERROR_MESSAGES: Record<GoogleErrorKind, string> = {
  no_access: "CatalogLink doesn't have access. Share the sheet (and image folders) with the service account email, or reconnect your Google account.",
  not_found: "The spreadsheet, tab or file was not found. It may have been deleted or renamed.",
  auth: "Google access was revoked or expired. Please reconnect your Google account.",
  rate_limited: "Google is rate-limiting requests right now. The sync will be retried automatically.",
  unavailable: "Google is temporarily unavailable. The sync will be retried automatically.",
  unknown: "Google returned an unexpected error.",
};

/** Normalises errors thrown by googleapis/gaxios (or anything else) into a GoogleError. */
export function toGoogleError(err: unknown): GoogleError {
  if (err instanceof GoogleError) return err;
  const e = err as { status?: number; code?: number | string; response?: { status?: number; data?: { error?: unknown } }; message?: string };
  const status = e?.response?.status ?? e?.status ?? (typeof e?.code === "number" ? e.code : undefined);
  const raw = `${e?.message ?? ""} ${JSON.stringify(e?.response?.data?.error ?? "")}`;
  let kind: GoogleErrorKind = "unknown";
  if (/invalid_grant|invalid_client|unauthorized_client|Token has been expired or revoked/i.test(raw) || status === 401) kind = "auth";
  else if (status === 403 && /rate|quota/i.test(raw)) kind = "rate_limited";
  else if (status === 403) kind = "no_access";
  else if (status === 404) kind = "not_found";
  else if (status === 429) kind = "rate_limited";
  else if (status && status >= 500) kind = "unavailable";
  else if (/ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up/i.test(raw)) kind = "unavailable";
  return new GoogleError(kind, kind === "unknown" && e?.message ? `${GOOGLE_ERROR_MESSAGES.unknown} (${e.message.slice(0, 200)})` : GOOGLE_ERROR_MESSAGES[kind], status);
}
