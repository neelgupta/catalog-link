/** Spreadsheet ID from a Google Sheets URL (or a bare ID). */
export function parseSpreadsheetId(input: string): string | null {
  const s = input.trim();
  const fromUrl = s.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
  if (fromUrl) return fromUrl[1]!;
  return /^[a-zA-Z0-9_-]{20,}$/.test(s) ? s : null;
}

export type ImageRef =
  | { kind: "file"; id: string }
  | { kind: "folder"; id: string }
  | { kind: "url"; url: string };

const DRIVE_ID = "([a-zA-Z0-9_-]{10,})";

/**
 * One image cell entry -> Drive file, Drive folder, or plain https image URL.
 * Accepts /file/d/<id>, open?id=, uc?id=, thumbnail?id=, /drive/folders/<id>, lh3 links.
 */
export function parseImageRef(input: string): ImageRef | null {
  const s = input.trim();
  if (!s) return null;
  let m = s.match(new RegExp(`drive\\.google\\.com/(?:drive/(?:u/\\d+/)?)?folders/${DRIVE_ID}`));
  if (m) return { kind: "folder", id: m[1]! };
  m = s.match(new RegExp(`drive\\.google\\.com/file/(?:u/\\d+/)?d/${DRIVE_ID}`));
  if (m) return { kind: "file", id: m[1]! };
  m = s.match(new RegExp(`(?:drive|docs)\\.google\\.com/(?:open|uc|thumbnail)\\?(?:[^#]*&)?id=${DRIVE_ID}`));
  if (m) return { kind: "file", id: m[1]! };
  m = s.match(new RegExp(`lh3\\.googleusercontent\\.com/d/${DRIVE_ID}`));
  if (m) return { kind: "file", id: m[1]! };
  if (/^https:\/\/\S+$/i.test(s)) return { kind: "url", url: s };
  return null;
}

/** Splits a cell holding several values separated by commas or new lines. */
export function splitList(cell: string | undefined): string[] {
  if (!cell) return [];
  return cell
    .split(/[\n,]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}
