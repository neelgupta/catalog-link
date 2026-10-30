import { z } from "zod";
import { OTP_LOGIN_ENABLED } from "./features";

const base64Key32 = z
  .string()
  .refine((v) => Buffer.from(v, "base64").length === 32, "must be a base64-encoded 32-byte key");

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.url(),
    REDIS_URL: z.url(),
    APP_URL: z.url().transform((v) => v.replace(/\/+$/, "")),
    SESSION_SECRET: z.string().min(32, "must be at least 32 characters"),
    ENCRYPTION_KEY: base64Key32,
    INTERNAL_API_SECRET: z.string().min(16, "must be at least 16 characters"),
    // Google credentials are checked when the Google features use them (Milestone 3).
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_SERVICE_ACCOUNT_KEY_FILE: z.string().optional(),
    /** Development only: local fixtures for DEMO_ sheets (ignored in production). */
    GOOGLE_FAKE_DIR: z.string().optional(),
    /** Always "off" while OTP_LOGIN_ENABLED is false, whatever .env says. */
    OTP_PROVIDER: z.preprocess(
      (v) => (OTP_LOGIN_ENABLED ? v || undefined : "off"),
      z.enum(["off", "console", "msg91"]).default("console"),
    ),
    MSG91_AUTH_KEY: z.string().optional(),
    MSG91_OTP_TEMPLATE_ID: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    // OTP login is switched off (features.ts): its settings aren't needed or checked.
    if (!OTP_LOGIN_ENABLED) return;
    if (env.OTP_PROVIDER === "off") {
      ctx.addIssue({ code: "custom", path: ["OTP_PROVIDER"], message: "set to console or msg91 while OTP login is on" });
    }
    if (env.OTP_PROVIDER === "msg91") {
      for (const key of ["MSG91_AUTH_KEY", "MSG91_OTP_TEMPLATE_ID"] as const) {
        if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: "required when OTP_PROVIDER=msg91" });
      }
    }
    if (env.NODE_ENV === "production" && env.OTP_PROVIDER === "console") {
      ctx.addIssue({ code: "custom", path: ["OTP_PROVIDER"], message: "console OTP is not allowed in production" });
    }
  });

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/** Validated environment. Throws a readable error listing every bad variable. */
export function getEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached && source === process.env) return cached;
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment variables (see .env.example):\n${lines.join("\n")}`);
  }
  if (source === process.env) cached = result.data;
  return result.data;
}
