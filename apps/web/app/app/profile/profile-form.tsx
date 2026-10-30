"use client";

import { useState } from "react";
import {
  Button,
  Checkbox,
  FormActions,
  FormError,
  FormSection,
  FormSuccess,
  Input,
  Textarea,
} from "@/components/ui";
import type { ActionState } from "@/lib/actions";
import { useKeepValuesAction } from "@/lib/use-keep-values-action";

type PaymentMode = "PAY_LATER" | "UPI" | "BANK";
type Profile = {
  businessName: string;
  whatsappNumber: string;
  loginMobile: string;
  loginEmail: string;
  city: string;
  address: string;
  gst: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  upiQrUrl: string | null;
  upiId: string;
  paymentModes: PaymentMode[];
  bankAccountName: string;
  bankAccountNumber: string;
  bankIfsc: string;
  bankName: string;
  bankBranch: string;
};

const MODES: { value: PaymentMode; label: string; hint: string }[] = [
  {
    value: "PAY_LATER",
    label: "Pay later / credit",
    hint: "Customer pays as per your usual terms",
  },
  { value: "UPI", label: "UPI", hint: "Show your UPI ID / QR at checkout" },
  { value: "BANK", label: "Bank transfer", hint: "Show your bank details at checkout" },
];

export function ProfileForm({
  action,
  profile,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  profile: Profile;
}) {
  // `stamp` changes on every save; image fields are keyed on it so their file input and preview clear.
  const [state, onSubmit, pending] = useKeepValuesAction<ActionState & { stamp?: number }>(
    async (prev, formData) => ({ ...(await action(prev, formData)), stamp: Date.now() }),
    {},
  );
  const [modes, setModes] = useState<PaymentMode[]>(profile.paymentModes);
  // After a failed save, show what was typed; otherwise the saved profile.
  const v = (name: keyof Profile) => state.values?.[name] ?? (profile[name] as string | null) ?? "";
  const err = (name: string) => state.fieldErrors?.[name];

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <FormError message={state.error} />
      <FormSuccess message={state.ok ? state.message : undefined} />

      <FormSection
        title="Business"
        description="Your name and contact details on the catalog link. Customers use the WhatsApp number to reach you."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Business name"
            name="businessName"
            defaultValue={v("businessName")}
            error={err("businessName")}
            required
          />
          <Input
            label="WhatsApp number for customers"
            name="whatsappNumber"
            type="tel"
            inputMode="numeric"
            defaultValue={v("whatsappNumber")}
            placeholder={profile.loginMobile}
            error={err("whatsappNumber")}
            hint={`Used for the WhatsApp and call buttons. Leave empty to use ${profile.loginMobile}.`}
          />
          <Input label="City" name="city" defaultValue={v("city")} error={err("city")} required />
          <Input
            label="GST number (optional)"
            name="gst"
            defaultValue={v("gst")}
            error={err("gst")}
            className="uppercase"
          />
          <div className="sm:col-span-2">
            <Textarea
              label="Address (optional)"
              name="address"
              defaultValue={v("address")}
              error={err("address")}
              rows={2}
            />
          </div>
        </div>
        <p className="mt-4 text-xs text-stone-500">
          Login: {profile.loginMobile} · {profile.loginEmail}. To change these, contact CatalogLink
          support.
        </p>
      </FormSection>

      <FormSection
        title="Branding"
        description="Your logo and banner appear at the top of every catalog link."
      >
        <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
          <ImageField
            key={`logo${state.stamp}`}
            name="logo"
            removeName="removeLogo"
            label="Logo"
            currentUrl={profile.logoUrl}
            hint="Square image, PNG/JPG/WebP up to 2 MB."
            previewClass="size-20"
            error={err("logo")}
          />
          <ImageField
            key={`banner${state.stamp}`}
            name="banner"
            removeName="removeBanner"
            label="Banner"
            currentUrl={profile.bannerUrl}
            hint="Wide image shown at the top of your catalog, about 1600 × 500 px, up to 5 MB."
            previewClass="aspect-[16/5] w-full max-w-md"
            error={err("banner")}
          />
        </div>
      </FormSection>

      <FormSection
        title="Payment options"
        description="What customers can choose at checkout, and the UPI or bank details shown to them."
      >
        <div className="space-y-5">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-stone-700">
              Customers can choose
            </legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {MODES.map((m) => (
                <label
                  key={m.value}
                  className={`flex cursor-pointer gap-2 rounded-xl border p-3 text-sm ${modes.includes(m.value) ? "border-brand-500 bg-brand-50" : "border-stone-200"}`}
                >
                  <input
                    type="checkbox"
                    name="paymentModes"
                    value={m.value}
                    checked={modes.includes(m.value)}
                    onChange={(e) =>
                      setModes((cur) =>
                        e.target.checked ? [...cur, m.value] : cur.filter((x) => x !== m.value),
                      )
                    }
                    className="mt-0.5 size-4 shrink-0 accent-brand-500"
                  />
                  <span>
                    <span className="block font-medium">{m.label}</span>
                    <span className="block text-xs text-stone-500">{m.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            {err("paymentModes") && (
              <p className="mt-1 text-xs text-red-600">{err("paymentModes")}</p>
            )}
          </fieldset>

          <div className={`space-y-4 ${modes.includes("UPI") ? "" : "opacity-70"}`}>
            <h3 className="text-sm font-semibold">UPI</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="UPI ID"
                name="upiId"
                defaultValue={v("upiId")}
                error={err("upiId")}
                placeholder="yourname@okhdfcbank"
                autoCapitalize="none"
              />
              <ImageField
                key={`qr${state.stamp}`}
                name="upiQr"
                removeName="removeUpiQr"
                label="UPI QR code (optional)"
                currentUrl={profile.upiQrUrl}
                hint="Screenshot of your UPI QR, up to 2 MB."
                previewClass="size-28"
                error={err("upiQr")}
              />
            </div>
          </div>

          <div className={`space-y-4 ${modes.includes("BANK") ? "" : "opacity-70"}`}>
            <h3 className="text-sm font-semibold">Bank account</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Account holder name"
                name="bankAccountName"
                defaultValue={v("bankAccountName")}
                error={err("bankAccountName")}
              />
              <Input
                label="Account number"
                name="bankAccountNumber"
                inputMode="numeric"
                defaultValue={v("bankAccountNumber")}
                error={err("bankAccountNumber")}
              />
              <Input
                label="IFSC code"
                name="bankIfsc"
                defaultValue={v("bankIfsc")}
                error={err("bankIfsc")}
                className="uppercase"
              />
              <Input
                label="Bank name (optional)"
                name="bankName"
                defaultValue={v("bankName")}
                error={err("bankName")}
              />
              <Input
                label="Branch (optional)"
                name="bankBranch"
                defaultValue={v("bankBranch")}
                error={err("bankBranch")}
              />
            </div>
            <p className="text-xs text-stone-500">
              Leave all bank fields empty if you don&apos;t take bank transfers.
            </p>
          </div>
        </div>
      </FormSection>

      <FormActions>
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? "Saving…" : "Save profile"}
        </Button>
      </FormActions>
    </form>
  );
}

function ImageField({
  name,
  removeName,
  label,
  currentUrl,
  hint,
  previewClass,
  error,
}: {
  name: string;
  removeName: string;
  label: string;
  currentUrl: string | null;
  hint: string;
  previewClass: string;
  error?: string;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const shown = preview ?? currentUrl;
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-stone-700">{label}</p>
      {shown ? (
        // eslint-disable-next-line @next/next/no-img-element -- local preview / stored upload
        <img
          src={shown}
          alt=""
          className={`${previewClass} rounded-lg border border-stone-200 bg-stone-50 object-cover`}
        />
      ) : (
        <div
          className={`${previewClass} flex items-center justify-center rounded-lg border border-dashed border-stone-300 text-xs text-stone-400`}
        >
          None
        </div>
      )}
      <input
        type="file"
        name={name}
        accept="image/png,image/jpeg,image/webp"
        aria-label={label}
        className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:py-2 file:text-sm file:font-medium"
        onChange={(e) => {
          const file = e.target.files?.[0];
          setPreview(file ? URL.createObjectURL(file) : null);
        }}
      />
      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : (
        <p className="text-xs text-stone-500">{hint}</p>
      )}
      {currentUrl && (
        <Checkbox
          name={removeName}
          label={`Remove current ${label.replace(/ \(optional\)$/, "").toLowerCase()}`}
        />
      )}
    </div>
  );
}
