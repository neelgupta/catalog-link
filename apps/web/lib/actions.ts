import { isDomainError } from "@cataloglink/core/errors";
import type { ZodError } from "zod";

/** Result of a form Server Action, consumed with useActionState. */
export type ActionState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Submitted values, so the form can be re-filled after an error. */
  values?: Record<string, string>;
};

/** Text fields of a form (files and React's internal $ACTION fields are skipped). */
export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !key.startsWith("$ACTION")) values[key] = value;
  }
  return values;
}

export function zodState(error: ZodError, values?: Record<string, string>): ActionState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    fieldErrors[key] ??= issue.message;
  }
  return { error: "Please fix the highlighted fields.", fieldErrors, values };
}

/** Turns a DomainError into form state; anything else is rethrown (Next shows the error page). */
export function errorState(err: unknown, values?: Record<string, string>): ActionState {
  if (isDomainError(err)) {
    return { error: err.message, fieldErrors: err.field ? { [err.field]: err.message } : undefined, values };
  }
  throw err;
}

/** Reads an uploaded file field; returns undefined when no file was chosen. */
export async function fileBuffer(formData: FormData, name: string): Promise<{ data: Buffer; name: string } | undefined> {
  const file = formData.get(name);
  if (!(file instanceof File) || file.size === 0) return undefined;
  return { data: Buffer.from(await file.arrayBuffer()), name: file.name };
}
