import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GoogleAuth, OAuth2Client } from "google-auth-library";
import { decryptSecret } from "../crypto";
import { DomainError } from "../errors";

export const OAUTH_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.readonly",
];
const SA_SCOPES = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive.readonly"];

export const oauthRedirectUri = () => `${(process.env.APP_URL ?? "").replace(/\/+$/, "")}/api/v1/google/oauth/callback`;

export function oauthConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function oauthClient() {
  if (!oauthConfigured()) {
    throw new DomainError("GOOGLE_OAUTH_NOT_CONFIGURED", "Google sign-in isn't set up yet. Use the service account option for now.");
  }
  return new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: oauthRedirectUri(),
  });
}

export function buildAuthUrl(state: string) {
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // always return a refresh token
    include_granted_scopes: true,
    scope: OAUTH_SCOPES,
    state,
  });
}

/** Exchanges the callback code for a long-lived refresh token and the Google account email. */
export async function exchangeCode(code: string, client = oauthClient()) {
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new DomainError("GOOGLE_NO_REFRESH_TOKEN", "Google didn't grant offline access. Remove CatalogLink from your Google account's third-party access and connect again.");
  }
  const granted = tokens.scope?.split(" ") ?? [];
  const missing = SA_SCOPES.filter((s) => !granted.includes(s));
  if (missing.length) {
    throw new DomainError("GOOGLE_SCOPES_MISSING", "Please allow access to Google Sheets and Drive (both checkboxes) when connecting.");
  }
  let email: string | null = null;
  if (tokens.id_token) {
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
    email = ticket.getPayload()?.email ?? null;
  }
  return { refreshToken: tokens.refresh_token, email };
}

type ServiceAccountKey = { client_email: string; private_key: string };

let saKey: ServiceAccountKey | null | undefined;

function readServiceAccountKey(): ServiceAccountKey | null {
  if (saKey !== undefined) return saKey;
  const file = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  if (!file) return (saKey = null);
  try {
    // Relative paths are relative to the repo root (where .env lives).
    const path = resolve(process.env.REPO_ROOT ?? process.cwd(), file);
    const json = JSON.parse(readFileSync(path, "utf8")) as Partial<ServiceAccountKey>;
    saKey = json.client_email && json.private_key ? (json as ServiceAccountKey) : null;
  } catch {
    saKey = null;
  }
  return saKey;
}

/** The email clients share their sheet with, or null when no key file is configured. */
export function serviceAccountEmail(): string | null {
  const real = readServiceAccountKey()?.client_email;
  if (real) return real;
  // Development fixtures only: lets the "share with us" flow be tried with DEMO_ sheets.
  if (process.env.GOOGLE_FAKE_DIR && process.env.NODE_ENV !== "production") return "cataloglink-dev@fake-project.iam.gserviceaccount.com";
  return null;
}

/** Auth client for a sheet connection (OAuth refresh token, or the platform service account). */
export function authFor(connection: { mode: "OAUTH" | "SERVICE_ACCOUNT"; oauthRefreshTokenEnc: string | null }) {
  if (connection.mode === "OAUTH") {
    if (!connection.oauthRefreshTokenEnc) throw new DomainError("GOOGLE_NOT_CONNECTED", "Google account is not connected");
    const client = oauthClient();
    client.setCredentials({ refresh_token: decryptSecret(connection.oauthRefreshTokenEnc, process.env.ENCRYPTION_KEY ?? "") });
    return client;
  }
  const key = readServiceAccountKey();
  if (!key) throw new DomainError("GOOGLE_SA_NOT_CONFIGURED", "The service account key file is not configured on the server");
  return new GoogleAuth({ credentials: key, scopes: SA_SCOPES });
}
