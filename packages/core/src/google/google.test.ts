import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildAuthUrl, exchangeCode, oauthConfigured, oauthRedirectUri } from "./auth";
import { toGoogleError } from "./source";
import { isSyncDue } from "../sync/schedule";

describe("toGoogleError", () => {
  it.each([
    [{ response: { status: 403, data: { error: { message: "The caller does not have permission" } } } }, "no_access", false],
    [{ response: { status: 403, data: { error: { message: "Quota exceeded for quota metric 'Read requests'" } } } }, "rate_limited", true],
    [{ response: { status: 429 } }, "rate_limited", true],
    [{ response: { status: 404 } }, "not_found", false],
    [{ response: { status: 503 } }, "unavailable", true],
    [{ message: "invalid_grant" }, "auth", false],
    [{ response: { status: 401 } }, "auth", false],
    [{ message: "connect ETIMEDOUT 142.250.1.1:443" }, "unavailable", true],
    [new Error("weird"), "unknown", false],
  ])("%j -> %s", (err, kind, transient) => {
    const g = toGoogleError(err);
    expect(g.kind).toBe(kind);
    expect(g.transient).toBe(transient);
  });
});

describe("OAuth helpers", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    process.env.APP_URL = "https://cataloglink.in/";
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("is off until both client ID and secret are set", () => {
    delete process.env.GOOGLE_CLIENT_SECRET;
    expect(oauthConfigured()).toBe(false);
    expect(() => buildAuthUrl("s")).toThrow(/isn't set up yet/);
  });

  it("asks for offline access to Sheets + read-only Drive with our redirect and state", () => {
    expect(oauthRedirectUri()).toBe("https://cataloglink.in/api/v1/google/oauth/callback");
    const url = new URL(buildAuthUrl("state-123"));
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("redirect_uri")).toBe(oauthRedirectUri());
    expect(url.searchParams.get("scope")?.split(" ")).toEqual(
      expect.arrayContaining(["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive.readonly"]),
    );
  });

  const fakeClient = (tokens: Record<string, string>) =>
    ({
      getToken: async () => ({ tokens }),
      verifyIdToken: async () => ({ getPayload: () => ({ email: "owner@gmail.com" }) }),
    }) as never;
  const allScopes = "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly";

  it("returns the refresh token and account email", async () => {
    expect(await exchangeCode("code", fakeClient({ refresh_token: "rt", scope: allScopes, id_token: "x" }))).toEqual({
      refreshToken: "rt",
      email: "owner@gmail.com",
    });
  });

  it("rejects consent without a refresh token or without Sheets/Drive access", async () => {
    await expect(exchangeCode("code", fakeClient({ scope: allScopes }))).rejects.toMatchObject({ code: "GOOGLE_NO_REFRESH_TOKEN" });
    await expect(exchangeCode("code", fakeClient({ refresh_token: "rt", scope: "openid" }))).rejects.toMatchObject({ code: "GOOGLE_SCOPES_MISSING" });
  });
});

describe("isSyncDue", () => {
  const now = new Date("2026-10-29T10:00:00Z");
  it("is due when never synced or the interval has passed", () => {
    expect(isSyncDue(null, 5, now)).toBe(true);
    expect(isSyncDue(new Date("2026-10-29T09:55:00Z"), 5, now)).toBe(true);
    expect(isSyncDue(new Date("2026-10-29T09:56:00Z"), 5, now)).toBe(false);
  });
});

describe("parseSheetGid", () => {
  it("reads the tab id from a sheet link", async () => {
    const { parseSheetGid } = await import("./links");
    expect(parseSheetGid("https://docs.google.com/spreadsheets/d/abc/edit#gid=123456")).toBe(123456);
    expect(parseSheetGid("https://docs.google.com/spreadsheets/d/abc/edit?gid=0#gid=0")).toBe(0);
    expect(parseSheetGid("https://docs.google.com/spreadsheets/d/abc/edit")).toBeNull();
  });
});
