"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormError } from "@/components/ui";
import type { ActionState } from "@/lib/actions";

export function DeletePlanForm({ action }: { action: (state: ActionState) => Promise<ActionState> }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-3">
      <p className="text-sm text-stone-600">This plan was never assigned, so it can be deleted.</p>
      <FormError message={state.error} />
      <SubmitButton variant="danger" pendingText="Deleting…" confirm="Delete this plan?">Delete plan</SubmitButton>
    </form>
  );
}
