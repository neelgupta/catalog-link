"use client";

import { type FormEvent, useActionState, useTransition } from "react";

/**
 * useActionState for forms with controlled inputs (checkbox lists, pickers). A plain `<form action>`
 * makes React reset the form after each submit, which leaves controlled checkboxes showing a different
 * state than the one that will be submitted. Submitting through onSubmit skips that reset.
 */
export function useKeepValuesAction<S>(action: (state: Awaited<S>, formData: FormData) => S | Promise<S>, initialState: Awaited<S>) {
  const [state, dispatch, pending] = useActionState(action, initialState);
  const [, startTransition] = useTransition();
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => dispatch(formData));
  };
  return [state, onSubmit, pending] as const;
}
