import { Prisma, prisma, type SheetConnectionMode } from "@cataloglink/db";
import { encryptSecret } from "../crypto";
import { DomainError } from "../errors";
import { fakeGoogleEnabled, googleSourceFor, parseSheetGid, parseSpreadsheetId, serviceAccountEmail, toGoogleError } from "../google";
import { describeMissing, mapHeaders, TEMPLATE_HEADERS } from "./headers";

/** Turns a Google error into a message for the client. `googleEmail` set = OAuth (we act as that account). */
function asDomainError(err: unknown, field?: string, googleEmail?: string | null): never {
  if (err instanceof DomainError) throw err;
  const g = toGoogleError(err);
  let message = g.message;
  if (g.kind === "no_access" || g.kind === "not_found") {
    message =
      googleEmail !== undefined
        ? `Your Google account${googleEmail ? ` (${googleEmail})` : ""} can't open this spreadsheet. Check the link, and that this account owns the sheet or has access to it.`
        : `CatalogLink can't open this spreadsheet. ${
            serviceAccountEmail() ? `Share it with ${serviceAccountEmail()} (Editor) and try again.` : "Check the link and sharing settings."
          }`;
  } else if (g.kind === "auth") {
    message = "Your Google connection has expired or was removed. Connect your Google account again.";
  }
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

/**
 * Step 2 of the OAuth flow: the client pastes their sheet link and we connect it in one go.
 * The tab is the one the link points at (`#gid=…`), otherwise the first tab whose columns match the
 * template. Then the connection is saved (the caller starts the first sync).
 */
export async function connectSheetByLink(clientId: string, sheetUrl: string) {
  const conn = await requireOAuthConnection(clientId);
  const spreadsheetId = parseSpreadsheetId(sheetUrl);
  if (!spreadsheetId) throw new DomainError("BAD_SHEET_LINK", "Paste the full Google Sheets link (docs.google.com/spreadsheets/d/…)", "sheetUrl");
  const gid = parseSheetGid(sheetUrl);
  const source = sourceFor("OAUTH", conn.oauthRefreshTokenEnc);

  let tab: string | undefined;
  let firstProblem: { tab: string; missing: ReturnType<typeof mapHeaders>["missing"] } | undefined;
  try {
    const info = await source.getSpreadsheet(spreadsheetId);
    if (!info.tabs.length) throw new DomainError("NO_TABS", "This spreadsheet has no tabs.", "sheetUrl");
    const linked = gid === null ? -1 : info.tabIds.indexOf(gid);
    // A link to a specific tab means that tab; otherwise try the tabs in order.
    const candidates = linked >= 0 ? [info.tabs[linked]!] : info.tabs;
    for (const name of candidates) {
      const header = (await source.readValues(spreadsheetId, name))[0] ?? [];
      const { missing } = mapHeaders(header);
      if (!missing.length) {
        tab = name;
        break;
      }
      firstProblem ??= { tab: name, missing };
    }
  } catch (err) {
    asDomainError(err, "sheetUrl", conn.googleEmail);
  }

  if (!tab) {
    const p = firstProblem!;
    throw new DomainError(
      "MISSING_COLUMNS",
      gid !== null
        ? `The tab "${p.tab}" doesn't have the template's columns. Missing: ${describeMissing(p.missing)}. Rename the columns to match the template, or copy the link while your products tab is open.`
        : `No tab in this spreadsheet has the template's columns. Missing in "${p.tab}": ${describeMissing(p.missing)}. Rename the columns to match the template (download it above).`,
      "sheetUrl",
    );
  }
  return selectSheet(clientId, "OAUTH", spreadsheetId, tab);
}

/**
 * DEVELOPMENT ONLY (GOOGLE_FAKE_DIR set): connects a pretend Google account so the link step can be
 * tried with the demo sheets (DEMO_… links) without real Google sign-in.
 */
export async function connectDemoGoogleAccount(clientId: string) {
  if (!fakeGoogleEnabled()) throw new DomainError("NOT_AVAILABLE", "The demo account is only available in development");
  return saveOAuthAccount(clientId, "dev-fixture-token", "demo.account@example.com");
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
