import { describe, expect, it } from "vitest";
import type { OtpProvider } from "./providers";
import { Msg91OtpProvider } from "./providers";
import { OTP_MAX_ATTEMPTS, OtpService, type OtpRecord, type OtpStore } from "./service";

function memoryStore() {
  const rows: (OtpRecord & { mobile: string; purpose: string; clientId: string | null; consumed: boolean })[] = [];
  let seq = 0;
  const store: OtpStore = {
    async invalidateActive(mobile, purpose, clientId) {
      for (const r of rows)
        if (r.mobile === mobile && r.purpose === purpose && r.clientId === clientId) r.consumed = true;
    },
    async create(row) {
      rows.push({ id: String(++seq), attempts: 0, consumed: false, ...row });
    },
    async findLatestActive(mobile, purpose, clientId) {
      return (
        rows
          .filter((r) => r.mobile === mobile && r.purpose === purpose && r.clientId === clientId && !r.consumed)
          .at(-1) ?? null
      );
    },
    async incrementAttempts(id) {
      rows.find((r) => r.id === id)!.attempts++;
    },
    async consume(id) {
      rows.find((r) => r.id === id)!.consumed = true;
    },
  };
  return { store, rows };
}

function capturingProvider() {
  const sent: { mobile: string; code: string }[] = [];
  const provider: OtpProvider = {
    name: "test",
    async send(mobile, code) {
      sent.push({ mobile, code });
    },
  };
  return { provider, sent };
}

function setup(now = () => new Date("2026-10-29T10:00:00Z")) {
  const { store, rows } = memoryStore();
  const { provider, sent } = capturingProvider();
  return { otp: new OtpService(store, provider, "pepper", now), rows, sent };
}

describe("OtpService", () => {
  it("sends a 6-digit code and stores only its hash", async () => {
    const { otp, rows, sent } = setup();
    await otp.send("9876543210", "CLIENT_LOGIN");
    expect(sent[0]!.code).toMatch(/^\d{6}$/);
    expect(rows[0]!.codeHash).not.toContain(sent[0]!.code);
  });

  it("verifies the right code once", async () => {
    const { otp, sent } = setup();
    await otp.send("9876543210", "CLIENT_LOGIN");
    const code = sent[0]!.code;
    expect(await otp.verify("9876543210", "CLIENT_LOGIN", code)).toEqual({ ok: true });
    expect(await otp.verify("9876543210", "CLIENT_LOGIN", code)).toEqual({ ok: false, reason: "invalid" });
  });

  it("does not accept a code for another purpose or client", async () => {
    const { otp, sent } = setup();
    await otp.send("9876543210", "CUSTOMER", "client-a");
    const code = sent[0]!.code;
    expect((await otp.verify("9876543210", "CLIENT_LOGIN", code)).ok).toBe(false);
    expect((await otp.verify("9876543210", "CUSTOMER", code, "client-b")).ok).toBe(false);
    expect((await otp.verify("9876543210", "CUSTOMER", code, "client-a")).ok).toBe(true);
  });

  it("invalidates the previous code when a new one is sent", async () => {
    const { otp, sent } = setup();
    await otp.send("9876543210", "CLIENT_LOGIN");
    await otp.send("9876543210", "CLIENT_LOGIN");
    expect((await otp.verify("9876543210", "CLIENT_LOGIN", sent[0]!.code)).ok).toBe(sent[0]!.code === sent[1]!.code);
    expect((await otp.verify("9876543210", "CLIENT_LOGIN", sent[1]!.code)).ok).toBe(true);
  });

  it("rejects expired codes", async () => {
    let now = new Date("2026-10-29T10:00:00Z");
    const { otp, sent } = setup(() => now);
    await otp.send("9876543210", "CLIENT_LOGIN");
    now = new Date("2026-10-29T10:05:01Z");
    expect(await otp.verify("9876543210", "CLIENT_LOGIN", sent[0]!.code)).toEqual({ ok: false, reason: "expired" });
  });

  it("locks after too many wrong attempts, even for the right code", async () => {
    const { otp, sent } = setup();
    await otp.send("9876543210", "CLIENT_LOGIN");
    const wrong = sent[0]!.code === "000000" ? "111111" : "000000";
    for (let i = 0; i < OTP_MAX_ATTEMPTS - 1; i++) {
      expect(await otp.verify("9876543210", "CLIENT_LOGIN", wrong)).toEqual({ ok: false, reason: "invalid" });
    }
    expect(await otp.verify("9876543210", "CLIENT_LOGIN", wrong)).toEqual({ ok: false, reason: "too_many_attempts" });
    expect(await otp.verify("9876543210", "CLIENT_LOGIN", sent[0]!.code)).toEqual({
      ok: false,
      reason: "too_many_attempts",
    });
  });
});

describe("Msg91OtpProvider", () => {
  it("calls the v5 OTP API with the template, 91-prefixed mobile and code", async () => {
    let called: { url: string; init: RequestInit } | undefined;
    const fakeFetch = (async (url: URL, init: RequestInit) => {
      called = { url: url.toString(), init };
      return new Response(JSON.stringify({ type: "success" }), { status: 200 });
    }) as unknown as typeof fetch;

    await new Msg91OtpProvider("auth-key", "tmpl-1", fakeFetch).send("9876543210", "123456");
    const url = new URL(called!.url);
    expect(url.origin + url.pathname).toBe("https://control.msg91.com/api/v5/otp");
    expect(url.searchParams.get("template_id")).toBe("tmpl-1");
    expect(url.searchParams.get("mobile")).toBe("919876543210");
    expect(url.searchParams.get("otp")).toBe("123456");
    expect((called!.init.headers as Record<string, string>).authkey).toBe("auth-key");
  });

  it("throws when MSG91 reports an error", async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ type: "error", message: "Invalid template" }), {
        status: 200,
      })) as unknown as typeof fetch;
    await expect(new Msg91OtpProvider("k", "t", fakeFetch).send("9876543210", "123456")).rejects.toThrow(
      "Invalid template",
    );
  });
});
