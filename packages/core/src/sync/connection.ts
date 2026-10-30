import { Prisma, prisma, type SheetConnectionMode } from "@cataloglink/db";
import { encryptSecret } from "../crypto";
import { DomainError } from "../errors";
import { googleSourceFor, parseSpreadsheetId, serviceAccountEmail, toGoogleError } from "../google";
import { describeMissing, mapHeaders, TEMPLATE_HEADERS } from "./headers";

function asDomainError(err: unknown, field?: string): never {
  if (err instanceof DomainError) throw err;
  const g = toGoogleError(err);
  const message =
    g.kind === "no_access" || g.kind === "not_found"
      ? `CatalogLink can't open this spreadsheet. ${
          serviceAccountEmail() ? `Share it with ${serviceAccountEmail()} (Editor) and try again.` : "Check the link and sharing settings."
        }`
      : g.message;
  throw new DomainError(`GOOGLE_${g.kind.toUpperCase()}`, message, field);
}

const sourceFor = (mode: SheetConnectionMode, oauthRefreshTokenEnc: string | null = null) =>
  googleSourceFor({ mode, oauthRefreshTokenEnc });

/** Step 1 (service account): open a pasted sheet link and list its tabs. */
export async function inspectSpreadsheetLink(sheetUrl: string) {
  const spreadsheetId = parseSpreadsheetId(sheetUrl);
  if (!spreadsheetId) throw new DomainError("BAD_SHEET_LINK", "Paste the full Google Sheets link (docs.google.com/spreadsheets/d/…)", "sheetUrl");
  try {
    return await sourceFor("SERVICE_ACCOUNT").getSpreadsheet(spreadsheetId);
  } catch (err) {
    asDomainError(err, "sheetUrl");
  }
}

/** Step 1 (OAuth): spreadsheets in the connected Google account, and a chosen one's tabs. */
export async function listAccountSpreadsheets(clientId: string) {
  const conn = await requireOAuthConnection(clientId);
  try {
    return await sourceFor("OAUTH", conn.oauthRefreshTokenEnc).listSpreadsheets();
  } catch (err) {
    asDomainError(err);
  }
}

export async function inspectAccountSpreadsheet(clientId: string, spreadsheetId: string) {
  const conn = await requireOAuthConnection(clientId);
  try {
    return await sourceFor("OAUTH", conn.oauthRefreshTokenEnc).getSpreadsheet(spreadsheetId);
  } catch (err) {
    asDomainError(err, "spreadsheetId");
  }
}

async function requireOAuthConnection(clientId: string) {
  const conn = await prisma.sheetConnection.findUnique({ where: { clientId } });
  if (conn?.mode !== "OAUTH" || !conn.oauthRefreshTokenEnc) {
    throw new DomainError("GOOGLE_NOT_CONNECTED", "Connect your Google account first");
  }
  return conn;
}

/**
 * Step 2: choose the tab. Checks the header row has every required column before saving, so a
 * wrong tab is caught now rather than on the first sync.
 */
export async function selectSheet(clientId: string, mode: SheetConnectionMode, spreadsheetId: string, tab: string) {
  const existing = await prisma.sheetConnection.findUnique({ where: { clientId } });
  const token = mode === "OAUTH" ? (existing?.mode === "OAUTH" ? existing.oauthRefreshTokenEnc : null) : null;
  if (mode === "OAUTH" && !token) throw new DomainError("GOOGLE_NOT_CONNECTED", "Connect your Google account first");

  let info, header: string[];
  try {
    const source = sourceFor(mode, token);
    info = await source.getSpreadsheet(spreadsheetId);
    if (!info.tabs.includes(tab)) throw new DomainError("TAB_NOT_FOUND", `Tab "${tab}" was not found in this spreadsheet`, "tab");
    header = (await source.readValues(spreadsheetId, tab))[0] ?? [];
  } catch (err) {
    asDomainError(err, "tab");
  }

  const { map, missing } = mapHeaders(header);
  if (missing.length) {
    throw new DomainError(
      "MISSING_COLUMNS",
      header.length
        ? `This tab is missing required column(s): ${describeMissing(missing)}. Rename your columns to match the template, or pick another tab.`
        : `This tab is empty. The first row must contain the column names, e.g. "${TEMPLATE_HEADERS.sku}", "${TEMPLATE_HEADERS.name}".`,
      "tab",
    );
  }

  return prisma.sheetConnection.upsert({
    where: { clientId },
    create: { clientId, mode, spreadsheetId, spreadsheetTitle: info.title, sheetName: tab, headerMap: map as Prisma.InputJsonValue },
    update: {
      mode,
      spreadsheetId,
      spreadsheetTitle: info.title,
      sheetName: tab,
      headerMap: map as Prisma.InputJsonValue,
      oauthRefreshTokenEnc: token,
      ...(mode === "SERVICE_ACCOUNT" ? { googleEmail: null } : {}),
      ...(existing?.spreadsheetId !== spreadsheetId || existing?.sheetName !== tab ? { lastStatus: null, lastSyncedAt: null } : {}),
    },
  });
}

/** Saves the Google account from the OAuth callback. An already-chosen sheet stays selected. */
export async function saveOAuthAccount(clientId: string, refreshToken: string, email: string | null) {
  const oauthRefreshTokenEnc = encryptSecret(refreshToken, process.env.ENCRYPTION_KEY ?? "");
  return prisma.sheetConnection.upsert({
    where: { clientId },
    create: { clientId, mode: "OAUTH", oauthRefreshTokenEnc, googleEmail: email },
    update: { mode: "OAUTH", oauthRefreshTokenEnc, googleEmail: email },
  });
}

/** Forgets the sheet connection. Products stay on the catalog link until a new sheet is synced. */
export async function disconnectSheet(clientId: string) {
  await prisma.sheetConnection.deleteMany({ where: { clientId } });
}
