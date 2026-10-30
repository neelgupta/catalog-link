"use client";

import type { ReactNode } from "react";

/** GET form that re-submits when a dropdown or checkbox changes (text fields submit with Enter / the button). */
export function AutoSubmitForm({
  action,
  className,
  children,
}: {
  action: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <form
      action={action}
      className={className}
      onChange={(e) => {
        const el = e.target as unknown as HTMLInputElement | HTMLSelectElement;
        if (
          el.name &&
          (el.tagName === "SELECT" || (el instanceof HTMLInputElement && el.type === "checkbox"))
        )
          e.currentTarget.requestSubmit();
      }}
      onSubmit={(e) => {
        // Leave empty fields out of the URL so shared links stay short.
        for (const el of Array.from(e.currentTarget.elements) as HTMLInputElement[]) {
          if (el.name && !el.value) el.disabled = true;
        }
      }}
    >
      {children}
    </form>
  );
}
