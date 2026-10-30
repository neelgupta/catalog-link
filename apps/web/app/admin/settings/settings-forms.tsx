"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormError, FormSuccess, Input } from "@/components/ui";
import type { ActionState } from "@/lib/actions";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

export function SettingsForm({
  action,
  values,
}: {
  action: Action;
  values: { defaultSyncIntervalMin: number; newArrivalDays: number };
}) {
  const [state, formAction] = useActionState(action, {});
  const v = (k: keyof typeof values) => state.values?.[k] ?? String(values[k]);
  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Default auto-sync interval (minutes)" name="defaultSyncIntervalMin" type="number" min={1} max={1440}
          defaultValue={v("defaultSyncIntervalMin")} error={state.fieldErrors?.defaultSyncIntervalMin}
          hint="How often client sheets are re-read. Clients can set their own later." />
        <Input label={'"New" badge for (days)'} name="newArrivalDays" type="number" min={1} max={90}
          defaultValue={v("newArrivalDays")} error={state.fieldErrors?.newArrivalDays}
          hint="Products added within this many days show a New badge." />
      </div>
      <FormError message={state.fieldErrors ? undefined : state.error} />
      <FormSuccess message={state.message} />
      <SubmitButton>Save settings</SubmitButton>
    </form>
  );
}

export function TemplateUploadForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-3">
      <input
        type="file"
        name="template"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:py-2 file:text-sm file:font-medium"
      />
      {state.fieldErrors?.template && <p className="text-xs text-red-600">{state.fieldErrors.template}</p>}
      <FormError message={state.fieldErrors ? undefined : state.error} />
      <FormSuccess message={state.message} />
      <SubmitButton variant="secondary" pendingText="Uploading…">Upload template</SubmitButton>
    </form>
  );
}
