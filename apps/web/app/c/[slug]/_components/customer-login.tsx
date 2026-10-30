"use client";

import { useState } from "react";

export type SavedCustomer = { name: string; shopName: string | null; city: string | null; address: string | null; gst: string | null } | null;

const inputClass = "h-11 w-full rounded-xl border border-stone-300 bg-white px-3.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 sm:text-sm";

async function post(url: string, body: object) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

/** Mobile number + OTP. Calls onVerified with saved details (if the customer ordered before). */
export function CustomerLogin({
  slug,
  onVerified,
  title = "Verify your mobile number",
  devHint = false,
}: {
  slug: string;
  onVerified: (mobile: string, customer: SavedCustomer) => void;
  title?: string;
  /** Development with OTP_PROVIDER=console: say where the code is. */
  devHint?: boolean;
}) {
  const [step, setStep] = useState<"mobile" | "code">("mobile");
  const [mobile, setMobile] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const send = async () => {
    setBusy(true);
    setError("");
    const { ok, data } = await post(`/api/v1/public/c/${slug}/otp/send`, { mobile });
    setBusy(false);
    if (!ok) return setError(data?.error?.message ?? "Could not send the OTP. Please try again.");
    setStep("code");
  };

  const verify = async () => {
    setBusy(true);
    setError("");
    const { ok, data } = await post(`/api/v1/public/c/${slug}/otp/verify`, { mobile, code });
    setBusy(false);
    if (!ok) return setError(data?.error?.message ?? "Could not verify the OTP.");
    onVerified(data.mobile, data.customer ?? null);
  };

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold">{title}</h2>
      {step === "mobile" ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-stone-700">Mobile number</span>
            <input value={mobile} onChange={(e) => setMobile(e.target.value)} type="tel" inputMode="numeric" autoComplete="tel" placeholder="98765 43210" required className={inputClass} />
          </label>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <button disabled={busy} className="h-11 w-full rounded-full bg-brand-500 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
            {busy ? "Sending…" : "Send OTP"}
          </button>
        </form>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            verify();
          }}
        >
          <p className="text-sm text-stone-600">
            Enter the 6-digit code sent to {mobile}.{" "}
            <button type="button" className="text-brand-700 underline" onClick={() => setStep("mobile")}>
              Change number
            </button>
          </p>
          {devHint && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Development: the OTP is printed in the terminal running pnpm dev.</p>}
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-stone-700">OTP</span>
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" required className={`${inputClass} tracking-widest`} />
          </label>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <button disabled={busy || code.length !== 6} className="h-11 w-full rounded-full bg-brand-500 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
            {busy ? "Verifying…" : "Verify"}
          </button>
          <button type="button" disabled={busy} onClick={send} className="w-full text-sm text-stone-600 underline">
            Resend OTP
          </button>
        </form>
      )}
    </div>
  );
}
