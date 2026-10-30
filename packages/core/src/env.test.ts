import { describe, expect, it } from "vitest";
import { getEnv } from "./env";
import { OTP_LOGIN_ENABLED } from "./features";

const valid = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  APP_URL: "http://localhost:3000/",
  SESSION_SECRET: "s".repeat(32),
  ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
  INTERNAL_API_SECRET: "i".repeat(16),
} as NodeJS.ProcessEnv;

describe("getEnv", () => {
  it("accepts a valid environment and applies defaults", () => {
    const env = getEnv(valid);
    expect(env.APP_URL).toBe("http://localhost:3000");
    expect(env.OTP_PROVIDER).toBe(OTP_LOGIN_ENABLED ? "console" : "off");
  });

  it("lists every invalid variable", () => {
    expect(() => getEnv({ ...valid, SESSION_SECRET: "short", ENCRYPTION_KEY: "abc" })).toThrow(
      /SESSION_SECRET[\s\S]*ENCRYPTION_KEY|ENCRYPTION_KEY[\s\S]*SESSION_SECRET/,
    );
  });

  it.runIf(OTP_LOGIN_ENABLED)("requires MSG91 credentials when OTP_PROVIDER=msg91", () => {
    expect(() => getEnv({ ...valid, OTP_PROVIDER: "msg91" })).toThrow(/MSG91_AUTH_KEY/);
    expect(
      getEnv({ ...valid, OTP_PROVIDER: "msg91", MSG91_AUTH_KEY: "k", MSG91_OTP_TEMPLATE_ID: "t" }).OTP_PROVIDER,
    ).toBe("msg91");
  });

  it.runIf(OTP_LOGIN_ENABLED)("refuses the console OTP provider in production", () => {
    expect(() => getEnv({ ...valid, NODE_ENV: "production" })).toThrow(/OTP_PROVIDER/);
  });

  it.runIf(!OTP_LOGIN_ENABLED)("with OTP login off, starts in production whatever the OTP settings say", () => {
    for (const OTP_PROVIDER of [undefined, "", "console", "msg91", "typo"]) {
      expect(getEnv({ ...valid, NODE_ENV: "production", OTP_PROVIDER }).OTP_PROVIDER).toBe("off");
    }
  });
});
