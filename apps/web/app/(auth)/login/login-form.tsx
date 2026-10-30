"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, FormError, Input } from "@/components/ui";
import { passwordLogin, type LoginState } from "./actions";

type Tab = "password" | "otp";

export function LoginForm({ next }: { next?: string }) {
  const [tab, setTab] = useState<Tab>("password");

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div role="tablist" className="mb-5 grid grid-cols-2 rounded-lg bg-stone-100 p-1 text-sm">
        {(["password", "otp"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`h-9 rounded-md font-medium transition ${tab === t ? "bg-white shadow-sm" : "text-stone-500"}`}
          >
            {t === "password" ? "Email & password" : "Mobile OTP"}
          </button>
        ))}
      </div>
      {tab === "password" ? <PasswordForm next={next} /> : <OtpForm />}
    </div>
  );
}

function PasswordForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(passwordLogin, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <Input label="Email" name="email" type="email" autoComplete="email" defaultValue={state.email} required />
      <Input label="Password" name="password" type="password" autoComplete="current-password" required />
      <FormError message={state.error} />
      <Button type="submit" disabled={pending} className="h-11 w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data } as { ok: boolean; data: { error?: { message: string }; redirectTo?: string } };
}

function OtpForm() {
  const router = useRouter();
  const [mobile, setMobile] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function send() {
    setPending(true);
    setError(undefined);
    const { ok, data } = await postJson("/api/v1/auth/otp/send", { mobile });
    setPending(false);
    if (!ok) return setError(data.error?.message ?? "Could not send the OTP.");
    setSent(true);
  }

  async function verify() {
    setPending(true);
    setError(undefined);
    const { ok, data } = await postJson("/api/v1/auth/otp/verify", { mobile, code });
    if (!ok) {
      setPending(false);
      return setError(data.error?.message ?? "Could not verify the OTP.");
    }
    router.replace(data.redirectTo ?? "/app");
    router.refresh();
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void (sent ? verify() : send());
      }}
    >
      <Input
        label="Registered mobile number"
        name="mobile"
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        placeholder="98765 43210"
        value={mobile}
        onChange={(e) => setMobile(e.target.value)}
        disabled={sent}
        required
      />
      {sent && (
        <>
          <Input
            label="6-digit OTP"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
            required
          />
          <p className="text-xs text-stone-500">
            If this number is registered, an OTP has been sent.{" "}
            <button
              type="button"
              className="font-medium text-brand-600 underline"
              onClick={() => {
                setSent(false);
                setCode("");
              }}
            >
              Change number
            </button>
          </p>
        </>
      )}
      <FormError message={error} />
      <Button type="submit" disabled={pending} className="h-11 w-full">
        {pending ? "Please wait…" : sent ? "Verify & sign in" : "Send OTP"}
      </Button>
    </form>
  );
}
