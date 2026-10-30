"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import {
  Checkbox,
  FormActions,
  FormError,
  FormSection,
  FormSuccess,
  Input,
  Select,
} from "@/components/ui";
import type { ActionState } from "@/lib/actions";

type Settings = {
  outOfStockMode: "badge" | "hide";
  lowStockThreshold: number;
  writeOrdersTab: boolean;
  syncIntervalMin: number | null;
  newArrivalDays: number | null;
};

const INTERVALS = [5, 10, 15, 30, 60, 120, 360, 720, 1440];
const minutes = (m: number) => (m < 60 ? `${m} minutes` : m === 60 ? "1 hour" : `${m / 60} hours`);

export function SettingsForm({
  action,
  settings,
  defaults,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  settings: Settings;
  defaults: { syncIntervalMin: number; newArrivalDays: number };
}) {
  const [state, formAction] = useActionState(action, {});
  const v = (name: keyof Settings) => state.values?.[name] ?? String(settings[name] ?? "");
  const err = (name: string) => state.fieldErrors?.[name];
  const intervals =
    INTERVALS.includes(settings.syncIntervalMin ?? 0) || !settings.syncIntervalMin
      ? INTERVALS
      : [...INTERVALS, settings.syncIntervalMin].sort((a, b) => a - b);

  return (
    <form action={formAction} className="space-y-6 lg:space-y-10">
      <FormError message={state.error} />
      <FormSuccess message={state.ok ? state.message : undefined} />

      <FormSection
        title="Stock on your links"
        description="Stock comes from the Available Qty column in your sheet. Choose how low and empty stock looks to customers."
      >
        <div className="space-y-5">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-stone-700">
              When a product&apos;s Available Qty is 0
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  [
                    "badge",
                    "Show it with an “Out of stock” badge",
                    "Customers can see it but can't order it.",
                  ],
                  [
                    "hide",
                    "Hide it from my links",
                    "It comes back when you add stock in the sheet.",
                  ],
                ] as const
              ).map(([value, label, hint]) => (
                <label
                  key={value}
                  className="flex cursor-pointer gap-2 rounded-xl border border-stone-200 p-3 text-sm has-checked:border-brand-500 has-checked:bg-brand-50"
                >
                  <input
                    type="radio"
                    name="outOfStockMode"
                    value={value}
                    defaultChecked={v("outOfStockMode") === value}
                    className="mt-0.5 size-4 shrink-0 accent-brand-500"
                  />
                  <span>
                    <span className="block font-medium">{label}</span>
                    <span className="block text-xs text-stone-500">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
            {err("outOfStockMode") && (
              <p className="mt-1 text-xs text-red-600">{err("outOfStockMode")}</p>
            )}
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Low stock badge"
              name="lowStockThreshold"
              type="number"
              min={0}
              inputMode="numeric"
              defaultValue={v("lowStockThreshold")}
              error={err("lowStockThreshold")}
              hint="Show “Only 5 left” when qty is at or below this number. 0 turns it off."
            />
            <Input
              label="“New” badge for (days)"
              name="newArrivalDays"
              type="number"
              min={1}
              max={90}
              inputMode="numeric"
              defaultValue={v("newArrivalDays")}
              placeholder={String(defaults.newArrivalDays)}
              error={err("newArrivalDays")}
              hint={`Products added in the last N days show as New. Empty = ${defaults.newArrivalDays} days. Products tagged “New Arrival” always do.`}
            />
          </div>
        </div>
      </FormSection>

      <FormSection
        title="Google Sheet"
        description="How often CatalogLink reads your sheet, and whether orders are written back to it."
      >
        <div className="space-y-5">
          <Select
            label="Sync automatically every"
            name="syncIntervalMin"
            defaultValue={v("syncIntervalMin")}
            error={err("syncIntervalMin")}
            hint="You can always press Sync now on the Google Sheet page."
          >
            <option value="">Default ({minutes(defaults.syncIntervalMin)})</option>
            {intervals.map((m) => (
              <option key={m} value={m}>
                {minutes(m)}
              </option>
            ))}
          </Select>
          <div>
            <Checkbox
              name="writeOrdersTab"
              label="Add orders to an “Orders” tab in my sheet"
              defaultChecked={
                state.values ? state.values.writeOrdersTab === "on" : settings.writeOrdersTab
              }
            />
            <p className="mt-1 ml-6 text-xs text-stone-500">
              Each new order is written as a row, and its status is kept up to date. CatalogLink
              needs Editor access to your sheet for this.
            </p>
          </div>
        </div>
      </FormSection>

      <FormActions>
        <SubmitButton className="w-full sm:w-auto">Save settings</SubmitButton>
      </FormActions>
    </form>
  );
}
