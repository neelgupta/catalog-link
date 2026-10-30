"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Checkbox, FormError, FormSuccess, Input } from "@/components/ui";
import type { ActionState } from "@/lib/actions";

type PlanValues = {
  name: string;
  maxProducts: number;
  maxCustomLinks: number;
  maxStaff: number;
  maxOrdersPerMonth: number;
  price: string;
  durationDays: number;
  isActive: boolean;
};

const DEFAULTS: PlanValues = {
  name: "",
  maxProducts: 1000,
  maxCustomLinks: 10,
  maxStaff: 0,
  maxOrdersPerMonth: 500,
  price: "0",
  durationDays: 365,
  isActive: true,
};

export function PlanForm({
  action,
  plan,
  submitLabel,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  plan?: PlanValues;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const base = plan ?? DEFAULTS;
  // After a successful create, the form goes back to the defaults.
  const v = (k: keyof PlanValues) => (state.ok ? String(DEFAULTS[k]) : (state.values?.[k] ?? String(base[k])));
  const e = (k: string) => state.fieldErrors?.[k];

  return (
    <form action={formAction} className="space-y-4" key={state.ok ? state.message : "form"}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <Input label="Plan name" name="name" defaultValue={v("name")} error={e("name")} required />
        </div>
        <Input label="Price (₹)" name="price" type="number" min={0} step="0.01" defaultValue={v("price")} error={e("price")} required />
        <Input label="Duration (days)" name="durationDays" type="number" min={1} defaultValue={v("durationDays")} error={e("durationDays")} required />
        <Input label="Max products" name="maxProducts" type="number" min={1} defaultValue={v("maxProducts")} error={e("maxProducts")} required />
        <Input label="Max custom links" name="maxCustomLinks" type="number" min={0} defaultValue={v("maxCustomLinks")} error={e("maxCustomLinks")} required
          hint="Not counting the default link" />
        <Input label="Max orders / month" name="maxOrdersPerMonth" type="number" min={1} defaultValue={v("maxOrdersPerMonth")} error={e("maxOrdersPerMonth")} required />
        <Input label="Max staff logins" name="maxStaff" type="number" min={0} defaultValue={v("maxStaff")} error={e("maxStaff")} required
          hint="Staff logins arrive in Phase 2" />
      </div>
      <Checkbox name="isActive" label="Active (can be assigned to clients)"
        defaultChecked={state.values ? state.values.isActive === "on" : base.isActive} />
      <FormError message={state.error} />
      <FormSuccess message={state.message} />
      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}
