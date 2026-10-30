"use client";

import { useActionState, useEffect, useState } from "react";
import { Avatar } from "@/components/avatar";
import { SubmitButton } from "@/components/submit-button";
import {
  Button,
  Checkbox,
  FormActions,
  FormError,
  FormSection,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import type { ActionState } from "@/lib/actions";

type Plan = { id: string; name: string; durationDays: number };
type ClientValues = {
  businessName: string;
  ownerName: string;
  mobile: string;
  email: string;
  gst: string | null;
  city: string;
  address: string | null;
  logoUrl: string | null;
};

function generatePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export function ClientForm({
  action,
  plans,
  client,
  onSaved,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  /** Present on create: the plan picker and the initial password are shown. */
  plans?: Plan[];
  /** Present on edit. */
  client?: ClientValues;
  /** Inside a pop-up: sections without cards, and this runs after a successful save. */
  onSaved?: (message?: string) => void;
}) {
  const [state, formAction] = useActionState(action, {});
  const flat = !!onSaved;
  useEffect(() => {
    if (state.ok) onSaved?.(state.message);
  }, [state, onSaved]);
  const [password, setPassword] = useState("");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const isCreate = !client;
  const v = (name: keyof ClientValues) =>
    state.values?.[name] ?? (client?.[name] as string | null) ?? "";
  const err = (name: string) => state.fieldErrors?.[name];

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />

      <FormSection flat={flat} title="Business" description="The client's business and owner details.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Business name"
            name="businessName"
            defaultValue={v("businessName")}
            error={err("businessName")}
            required
            hint={
              isCreate
                ? "The catalog link is created from this name, e.g. cataloglink.in/c/shree-krishna-textiles"
                : "The catalog link doesn't change when the name changes."
            }
          />
          <Input
            label="Owner name"
            name="ownerName"
            defaultValue={v("ownerName")}
            error={err("ownerName")}
            required
          />
          <Input
            label="Mobile (WhatsApp)"
            name="mobile"
            type="tel"
            inputMode="numeric"
            defaultValue={v("mobile")}
            error={err("mobile")}
            required
            hint="Used for OTP login."
          />
          <Input
            label="Email"
            name="email"
            type="email"
            defaultValue={v("email")}
            error={err("email")}
            required
            hint="Used for password login."
          />
          <Input
            label="GST number (optional)"
            name="gst"
            defaultValue={v("gst")}
            error={err("gst")}
            className="uppercase"
          />
          <Input label="City" name="city" defaultValue={v("city")} error={err("city")} required />
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
      </FormSection>

      <FormSection flat={flat} title="Logo" description="Shown on the client's catalog link.">
        <div className="flex items-center gap-4">
          {logoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local preview of the chosen file
            <img
              src={logoPreview}
              alt=""
              className="size-16 rounded-lg border border-stone-200 object-cover"
            />
          ) : (
            <Avatar
              name={v("businessName") || "?"}
              logoUrl={client?.logoUrl ?? null}
              size="size-16"
            />
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <input
              type="file"
              name="logo"
              accept="image/png,image/jpeg,image/webp"
              className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:py-2 file:text-sm file:font-medium"
              onChange={(e) => {
                const file = e.target.files?.[0];
                setLogoPreview(file ? URL.createObjectURL(file) : null);
              }}
            />
            <p className="text-xs text-stone-500">PNG, JPG or WebP, up to 2 MB.</p>
            {err("logo") && <p className="text-xs text-red-600">{err("logo")}</p>}
            {client?.logoUrl && <Checkbox name="removeLogo" label="Remove current logo" />}
          </div>
        </div>
      </FormSection>

      {isCreate && (
        <FormSection
          flat={flat}
          title="Login & plan"
          description="The client logs in with this email and password, or with an OTP to the mobile."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Input
                label="Initial password"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={err("password")}
                required
                autoComplete="new-password"
                hint="Share this with the client yourself. Login notifications are on hold."
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPassword(generatePassword())}
              >
                Generate password
              </Button>
            </div>
            <div className="space-y-4">
              <Select
                label="Plan"
                name="planId"
                defaultValue={state.values?.planId ?? plans?.[0]?.id}
                error={err("planId")}
                required
              >
                {plans?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.durationDays} days)
                  </option>
                ))}
              </Select>
              <Input
                label="Free trial days"
                name="trialDays"
                type="number"
                min={0}
                max={365}
                defaultValue={state.values?.trialDays ?? "14"}
                error={err("trialDays")}
                hint="0 = start the paid plan now. Otherwise the plan starts as a trial for this many days."
              />
            </div>
          </div>
        </FormSection>
      )}

      <FormActions>
        <SubmitButton className="w-full sm:w-auto" pendingText={isCreate ? "Creating…" : "Saving…"}>
          {isCreate ? "Create client" : "Save changes"}
        </SubmitButton>
      </FormActions>
    </form>
  );
}
