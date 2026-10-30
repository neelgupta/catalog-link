"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormError, FormSuccess } from "@/components/ui";
import type { ActionState } from "@/lib/actions";
import { setBlockedAction } from "./actions";

export function BlockButton({ customerId, blocked }: { customerId: string; blocked: boolean }) {
  const [state, action] = useActionState<ActionState>(() => setBlockedAction(customerId, !blocked), {});
  return (
    <form action={action} className="space-y-2">
      <SubmitButton
        variant={blocked ? "secondary" : "danger"}
        pendingText="Saving…"
        confirm={blocked ? undefined : "Block this customer? They can still browse your catalog but can't place orders."}
      >
        {blocked ? "Unblock customer" : "Block customer"}
      </SubmitButton>
      <FormError message={state.error} />
      <FormSuccess message={state.ok ? state.message : undefined} />
    </form>
  );
}
