import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import type { OtpProvider } from "./providers";

export type OtpPurpose = "CLIENT_LOGIN" | "CUSTOMER";

export const OTP_TTL_SEC = 5 * 60;
export const OTP_MAX_ATTEMPTS = 5;

export type OtpRecord = { id: string; codeHash: string; expiresAt: Date; attempts: number };

/** Persistence for OTP requests (Prisma in the app, in-memory in tests). */
export interface OtpStore {
  /** Marks any earlier unconsumed OTPs for this mobile/purpose/client as consumed. */
  invalidateActive(mobile: string, purpose: OtpPurpose, clientId: string | null): Promise<void>;
  create(row: {
    mobile: string;
    purpose: OtpPurpose;
    clientId: string | null;
    codeHash: string;
    expiresAt: Date;
  }): Promise<void>;
  findLatestActive(mobile: string, purpose: OtpPurpose, clientId: string | null): Promise<OtpRecord | null>;
  incrementAttempts(id: string): Promise<void>;
  consume(id: string): Promise<void>;
}

export type VerifyResult = { ok: true } | { ok: false; reason: "invalid" | "expired" | "too_many_attempts" };

export class OtpService {
  constructor(
    private readonly store: OtpStore,
    private readonly provider: OtpProvider,
    private readonly pepper: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  hash(mobile: string, code: string) {
    return createHash("sha256").update(`${this.pepper}:${mobile}:${code}`).digest("hex");
  }

  async send(mobile: string, purpose: OtpPurpose, clientId: string | null = null) {
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    await this.store.invalidateActive(mobile, purpose, clientId);
    await this.store.create({
      mobile,
      purpose,
      clientId,
      codeHash: this.hash(mobile, code),
      expiresAt: new Date(this.now().getTime() + OTP_TTL_SEC * 1000),
    });
    await this.provider.send(mobile, code);
  }

  async verify(
    mobile: string,
    purpose: OtpPurpose,
    code: string,
    clientId: string | null = null,
  ): Promise<VerifyResult> {
    const record = await this.store.findLatestActive(mobile, purpose, clientId);
    if (!record) return { ok: false, reason: "invalid" };
    if (record.expiresAt <= this.now()) return { ok: false, reason: "expired" };
    if (record.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, reason: "too_many_attempts" };

    const expected = Buffer.from(record.codeHash, "hex");
    const actual = Buffer.from(this.hash(mobile, code), "hex");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      const attempts = record.attempts + 1;
      await this.store.incrementAttempts(record.id);
      return { ok: false, reason: attempts >= OTP_MAX_ATTEMPTS ? "too_many_attempts" : "invalid" };
    }

    await this.store.consume(record.id);
    return { ok: true };
  }
}
