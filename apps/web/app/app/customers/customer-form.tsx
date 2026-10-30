"use client";

import { OTP_LOGIN_ENABLED } from "@cataloglink/core/features";
import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormActions, FormError, FormSection, FormSuccess, Input, Textarea } from "@/components/ui";
import type { ActionState } from "@/lib/actions";

type Values = { name: string; shopName: string | null; mobile: string; city: string | null; address: string | null; gst: string | null; linkIds: string[] };
type LinkOption = { id: string; name: string; slug: string; isActive: boolean };

export function CustomerForm({
  action,
  customer,
  links,
  mobileLocked = false,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  customer?: Values;
  links: LinkOption[];
  /** Customers with orders keep their mobile ("My orders" finds orders by it). */
  mobileLocked?: boolean;
}) {
  const [state, formAction] = useActionState(action, {});
  const v = (name: keyof Omit<Values, "linkIds">) => state.values?.[name] ?? customer?.[name] ?? "";
  const err = (name: string) => state.fieldErrors?.[name];

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />
      <FormSuccess message={state.ok ? state.message : undefined} />

      <FormSection title="Customer" description="Retailer or shop details. Customers are also added automatically when they place an order.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Name" name="name" defaultValue={v("name")} error={err("name")} required />
          <Input label="Shop name (optional)" name="shopName" defaultValue={v("shopName")} error={err("shopName")} />
          <Input
            label="Mobile"
            name="mobile"
            type="tel"
            inputMode="numeric"
            defaultValue={v("mobile")}
            error={err("mobile")}
            required
            readOnly={mobileLocked}
            hint={
              mobileLocked
                ? "Can't change: the customer's orders are kept under this number."
                : OTP_LOGIN_ENABLED
                  ? "They log in with an OTP to this number."
                  : undefined
            }
          />
          <Input label="City (optional)" name="city" defaultValue={v("city")} error={err("city")} />
          <Input label="GST number (optional)" name="gst" defaultValue={v("gst")} error={err("gst")} className="uppercase" />
          <div className="sm:col-span-2">
            <Textarea label="Address (optional)" name="address" defaultValue={v("address")} error={err("address")} rows={2} />
          </div>
        </div>
      </FormSection>

      <FormSection title="Catalog links" description="The links you've given this customer, so you can see who has which catalog.">
        {links.length ? (
          <ul className="space-y-2">
            {links.map((l) => (
              <li key={l.id}>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="linkIds" value={l.id} defaultChecked={customer?.linkIds.includes(l.id)} className="size-4 accent-brand-500" />
                  <span>{l.name}</span>
                  <span className="truncate text-xs text-stone-400">/c/{l.slug}</span>
                  {!l.isActive && <span className="text-xs text-stone-500">(off)</span>}
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-stone-500">No links yet.</p>
        )}
      </FormSection>

      <FormActions>
        <SubmitButton className="w-full sm:w-auto">{customer ? "Save customer" : "Add customer"}</SubmitButton>
      </FormActions>
    </form>
  );
}
