"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormError } from "@/components/ui";
import type { ActionState } from "@/lib/actions";
import { deleteLinkAction } from "../actions";

export function DeleteLinkButton({ linkId }: { linkId: string }) {
  const [state, action] = useActionState<ActionState>(() => deleteLinkAction(linkId), {});
  return (
    <form action={action} className="space-y-2">
      <FormError message={state.error} />
      <SubmitButton variant="danger" pendingText="Deleting…" confirm="Delete this link? Anyone who has it won't be able to open it.">
        Delete link
      </SubmitButton>
    </form>
  );
}
