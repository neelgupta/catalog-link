"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import type { ActionState } from "@/lib/actions";
import { setHiddenAction } from "./actions";

/** Hide / show a product on the catalog links (the sheet row is not touched). */
export function HideToggle({ productId, hidden, compact = false }: { productId: string; hidden: boolean; compact?: boolean }) {
  const [state, action] = useActionState<ActionState>(() => setHiddenAction(productId, !hidden), {});
  return (
    <form action={action} className={compact ? "" : "space-y-2"}>
      <SubmitButton variant={hidden ? "primary" : "secondary"} pendingText={hidden ? "Showing…" : "Hiding…"} className={compact ? "h-8 w-full px-3 text-xs" : "w-full sm:w-auto"}>
        {hidden ? "Show on links" : "Hide from links"}
      </SubmitButton>
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
