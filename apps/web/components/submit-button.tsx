"use client";

import { useFormStatus } from "react-dom";
import { Button } from "./ui";

/** Submit button that disables itself while its form's Server Action runs. */
export function SubmitButton({
  children,
  pendingText = "Saving…",
  variant,
  className,
  confirm,
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  className?: string;
  /** Ask for confirmation in a browser dialog before submitting. */
  confirm?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      className={className}
      disabled={pending}
      onClick={confirm ? (e) => !window.confirm(confirm) && e.preventDefault() : undefined}
    >
      {pending ? pendingText : children}
    </Button>
  );
}
