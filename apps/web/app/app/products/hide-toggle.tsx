"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { SubmitButton } from "@/components/submit-button";
import type { ActionState } from "@/lib/actions";
import { setHiddenAction } from "./actions";

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
      {off && <path d="M4 20 20 4" />}
    </svg>
  );
}

function SmallButton({ hidden }: { hidden: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title={hidden ? "Show this product on your links" : "Hide this product from your links"}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition disabled:opacity-60 ${
        hidden ? "bg-brand-500 text-white hover:bg-brand-600" : "text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100"
      }`}
    >
      <EyeIcon off={!hidden} />
      {pending ? "…" : hidden ? "Show" : "Hide"}
    </button>
  );
}

/** Hide / show a product on the catalog links (the sheet row is not touched). */
export function HideToggle({ productId, hidden, compact = false }: { productId: string; hidden: boolean; compact?: boolean }) {
  const [state, action] = useActionState<ActionState>(() => setHiddenAction(productId, !hidden), {});
  return (
    <form action={action} className={compact ? "" : "space-y-2"}>
      {compact ? (
        <SmallButton hidden={hidden} />
      ) : (
        <SubmitButton variant={hidden ? "primary" : "secondary"} pendingText={hidden ? "Showing…" : "Hiding…"} className="w-full sm:w-auto">
          {hidden ? "Show on links" : "Hide from links"}
        </SubmitButton>
      )}
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
