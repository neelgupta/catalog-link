"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Button, FormError, Input } from "@/components/ui";
import type { ActionState } from "@/lib/actions";
import { copyText } from "@/lib/copy-text";

export function PasteLinkForm({ action }: { action: (s: ActionState, f: FormData) => Promise<ActionState> }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-3">
      <Input
        label="Google Sheet link"
        name="sheetUrl"
        type="url"
        placeholder="https://docs.google.com/spreadsheets/d/…"
        defaultValue={state.values?.sheetUrl}
        error={state.fieldErrors?.sheetUrl}
        required
      />
      <FormError message={state.fieldErrors?.sheetUrl ? undefined : state.error} />
      <SubmitButton pendingText="Checking…">Continue</SubmitButton>
    </form>
  );
}

export function GoogleButton({ action }: { action: () => Promise<ActionState> }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-3">
      <SubmitButton pendingText="Opening Google…">Connect Google account</SubmitButton>
      <FormError message={state.error} />
    </form>
  );
}

export function CopyText({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 p-2">
      <code className="min-w-0 flex-1 truncate text-sm">{text}</code>
      <Button
        type="button"
        variant="secondary"
        className="h-8 shrink-0 px-3"
        onClick={async () => {
          if (await copyText(text)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } else {
            window.prompt("Copy this", text);
          }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
