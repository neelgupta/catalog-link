"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Button, FormError, FormSuccess, Input, Select, Textarea } from "@/components/ui";
import type { ActionState } from "@/lib/actions";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

export function ResetPasswordForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, {});
  const [password, setPassword] = useState("");
  return (
    <form action={formAction} className="space-y-3">
      <Input label="New password" name="password" value={password} onChange={(e) => setPassword(e.target.value)}
        error={state.fieldErrors?.password} autoComplete="new-password" required />
      <FormError message={state.fieldErrors ? undefined : state.error} />
      <FormSuccess message={state.message} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => {
          const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
          setPassword(Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => alphabet[b % alphabet.length]).join(""));
        }}>
          Generate
        </Button>
        <SubmitButton variant="secondary">Set password</SubmitButton>
      </div>
    </form>
  );
}

type Plan = { id: string; name: string; durationDays: number };

const DAY_MS = 86_400_000;
const addDaysIso = (iso: string, days: number) =>
  new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);

export function AssignPlanForm({ action, plans, today }: { action: Action; plans: Plan[]; today: string }) {
  const [state, formAction] = useActionState(action, {});
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [startAt, setStartAt] = useState(today);
  const [trialDays, setTrialDays] = useState("0");
  const [expiresAt, setExpiresAt] = useState(addDaysIso(today, plans[0]?.durationDays ?? 365));

  // Expiry follows plan/start/trial until the admin edits it by hand.
  const recompute = (p = planId, s = startAt, t = trialDays) => {
    const plan = plans.find((x) => x.id === p);
    const trial = Number(t) || 0;
    if (plan && /^\d{4}-\d{2}-\d{2}$/.test(s)) setExpiresAt(addDaysIso(s, trial > 0 ? trial : plan.durationDays));
  };

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Plan" name="planId" value={planId} error={state.fieldErrors?.planId}
          onChange={(e) => { setPlanId(e.target.value); recompute(e.target.value); }}>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.durationDays} days)</option>
          ))}
        </Select>
        <Input label="Trial days" name="trialDays" type="number" min={0} max={365} value={trialDays}
          error={state.fieldErrors?.trialDays} hint="0 for a paid plan"
          onChange={(e) => { setTrialDays(e.target.value); recompute(undefined, undefined, e.target.value); }} />
        <Input label="Start date" name="startAt" type="date" value={startAt} error={state.fieldErrors?.startAt}
          onChange={(e) => { setStartAt(e.target.value); recompute(undefined, e.target.value); }} />
        <Input label="Expiry date" name="expiresAt" type="date" value={expiresAt} error={state.fieldErrors?.expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)} />
      </div>
      <FormError message={state.fieldErrors ? undefined : state.error} />
      <FormSuccess message={state.message} />
      <SubmitButton variant="secondary" confirm="Assign this plan? The current plan will be replaced.">Assign plan</SubmitButton>
    </form>
  );
}

export function PaymentForm({ action, today }: { action: Action; today: string }) {
  const [state, formAction] = useActionState(action, {});
  const e = (k: string) => state.fieldErrors?.[k];
  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Amount (₹)" name="amount" type="number" min={0} step="0.01" defaultValue={state.ok ? "" : state.values?.amount} error={e("amount")} required />
        <Input label="Paid on" name="paidAt" type="date" defaultValue={state.values?.paidAt ?? today} error={e("paidAt")} required />
        <Input label="Reference (UPI / cheque no.)" name="reference" defaultValue={state.ok ? "" : state.values?.reference} error={e("reference")} />
        <Textarea label="Note" name="note" rows={1} defaultValue={state.ok ? "" : state.values?.note} error={e("note")} />
      </div>
      <FormError message={state.fieldErrors ? undefined : state.error} />
      <FormSuccess message={state.message} />
      <SubmitButton variant="secondary">Record payment</SubmitButton>
    </form>
  );
}

export function DeleteClientForm({ action, businessName }: { action: Action; businessName: string }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-3">
      <p className="text-sm text-stone-600">
        Permanently deletes this client, their login, links, products, customers and orders. This can&apos;t be undone.
        Deactivate the client instead if you may need the data later.
      </p>
      <Input label={`Type "${businessName}" to confirm`} name="confirmName" autoComplete="off" error={state.fieldErrors?.confirmName} />
      <SubmitButton variant="danger" pendingText="Deleting…">Delete client</SubmitButton>
    </form>
  );
}
