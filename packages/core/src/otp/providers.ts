import { DomainError } from "../errors";
import { OTP_OFF_MESSAGE } from "../features";

/** Sends an OTP code by SMS. */
export interface OtpProvider {
  readonly name: string;
  send(mobile: string, code: string): Promise<void>;
}

/** Development provider: prints the OTP to the server log instead of sending an SMS. */
export class ConsoleOtpProvider implements OtpProvider {
  readonly name = "console";
  async send(mobile: string, code: string) {
    console.log(`[otp] ${mobile} -> ${code}`);
  }
}

/**
 * MSG91 OTP API v5. Sends our own generated code through a DLT-approved template
 * (template variable ##OTP##); verification happens on our side.
 */
export class Msg91OtpProvider implements OtpProvider {
  readonly name = "msg91";
  constructor(
    private readonly authKey: string,
    private readonly templateId: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(mobile: string, code: string) {
    const url = new URL("https://control.msg91.com/api/v5/otp");
    url.searchParams.set("template_id", this.templateId);
    url.searchParams.set("mobile", `91${mobile}`);
    url.searchParams.set("otp", code);

    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: { authkey: this.authKey, "content-type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
    if (!res.ok || body.type === "error") {
      throw new Error(`MSG91 OTP send failed: ${body.message ?? res.status}`);
    }
  }
}

export function createOtpProvider(env: {
  OTP_PROVIDER: "off" | "console" | "msg91";
  MSG91_AUTH_KEY?: string;
  MSG91_OTP_TEMPLATE_ID?: string;
}): OtpProvider {
  if (env.OTP_PROVIDER === "off") throw new DomainError("OTP_OFF", OTP_OFF_MESSAGE);
  if (env.OTP_PROVIDER === "msg91") {
    return new Msg91OtpProvider(env.MSG91_AUTH_KEY!, env.MSG91_OTP_TEMPLATE_ID!);
  }
  return new ConsoleOtpProvider();
}
