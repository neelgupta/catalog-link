"use client";

import { X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";

/** A centred pop-up (native <dialog>): closes with ×, Escape or a tap outside. */
export function Modal({
  open,
  onClose,
  title,
  children,
  size = "max-w-xl",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  size?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={`m-auto max-h-[90dvh] w-[calc(100%-2rem)] ${size} rounded-2xl bg-white p-0 shadow-2xl backdrop:bg-black/40`}
    >
      {open && (
        <>
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-stone-100 bg-white px-5 py-4">
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-800">
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
          <div className="p-5">{children}</div>
        </>
      )}
    </dialog>
  );
}

/** A short success message at the bottom of the screen that hides itself after a few seconds. */
export function useFlash(): [ReactNode, (message?: string) => void] {
  const [message, setMessage] = useState<string>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flash = useCallback((m?: string) => {
    clearTimeout(timer.current);
    setMessage(m);
    if (m) timer.current = setTimeout(() => setMessage(undefined), 4000);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const node = message ? (
    <p
      role="status"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800 shadow-lg ring-1 ring-green-200 sm:right-6 sm:left-auto"
    >
      {message}
    </p>
  ) : null;
  return [node, flash];
}
