"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormError } from "@/components/ui";
import type { ActionState } from "@/lib/actions";

export function TabForm({
  action,
  tabs,
  current,
}: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>;
  tabs: string[];
  current?: string | null;
}) {
  const [state, formAction] = useActionState(action, {});
  const selected = state.values?.tab ?? current ?? (tabs.length === 1 ? tabs[0] : undefined);
  return (
    <form action={formAction} className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium text-stone-700">Which tab has your products?</legend>
        {tabs.map((tab) => (
          <label key={tab} className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-3 text-sm has-checked:border-brand-500 has-checked:bg-brand-50">
            <input type="radio" name="tab" value={tab} defaultChecked={tab === selected} className="accent-brand-500" />
            {tab}
          </label>
        ))}
      </fieldset>
      <FormError message={state.error} />
      <SubmitButton pendingText="Checking columns…">Use this tab and sync</SubmitButton>
    </form>
  );
}
