"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type FormHTMLAttributes, type ReactNode, useEffect, useRef } from "react";

const TYPING_DELAY_MS = 350;

/**
 * GET filter form that updates the page as you go: text fields search while typing (after a short
 * pause), dropdowns / dates / checkboxes apply at once. The URL keeps the filters (empty ones and the
 * page number are left out), and navigation happens in place so the keyboard stays open.
 *
 * `live="search"` makes only the text search live; other fields wait for the submit button (used
 * by the shop's Filters sheet). Inputs marked `data-close-on-submit` (a sheet's open/close checkbox)
 * are unchecked after a submit and whenever the URL changes.
 */
export function LiveForm({
  action,
  live = "all",
  children,
  ...props
}: { action: string; live?: "all" | "search"; children: ReactNode } & Omit<FormHTMLAttributes<HTMLFormElement>, "action">) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const ref = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const go = () => {
    clearTimeout(timer.current);
    const form = ref.current;
    if (!form) return;
    const next = new URLSearchParams();
    for (const [k, v] of new FormData(form)) {
      if (typeof v === "string" && v.trim() && k !== "page") next.append(k, v.trim());
    }
    const qs = next.toString();
    const url = `${action}${qs ? `?${qs}` : ""}`;
    if (url !== `${pathname}${params.size ? `?${params}` : ""}`) router.replace(url, { scroll: false });
  };

  // When the URL changes (a search, a "Clear" link, a chip): close sheets opened from this form and
  // show the URL's values in the fields the user isn't typing in.
  useEffect(() => {
    const form = ref.current;
    if (!form) return;
    for (const el of Array.from(form.querySelectorAll<HTMLInputElement>("[data-close-on-submit]"))) el.checked = false;
    for (const el of Array.from(form.elements) as HTMLInputElement[]) {
      if (!el.name || el.type === "hidden" || el === document.activeElement) continue;
      const value = params.get(el.name) ?? "";
      if (el.type === "checkbox") el.checked = params.getAll(el.name).includes(el.value);
      else if (el.type === "radio") el.checked = value === el.value;
      else if (el.value !== value) el.value = value;
    }
  }, [params]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <form
      {...props}
      ref={ref}
      action={action}
      onInput={(e) => {
        const el = e.target as unknown as HTMLInputElement;
        if (!el.name || !["text", "search"].includes(el.type)) return;
        clearTimeout(timer.current);
        timer.current = setTimeout(go, TYPING_DELAY_MS);
      }}
      onChange={(e) => {
        const el = e.target as unknown as HTMLInputElement;
        if (live !== "all" || !el.name || ["text", "search", "number"].includes(el.type)) return;
        go();
      }}
      onSubmit={(e) => {
        e.preventDefault();
        go();
        for (const el of Array.from(e.currentTarget.querySelectorAll<HTMLInputElement>("[data-close-on-submit]"))) el.checked = false;
        (document.activeElement as HTMLElement | null)?.blur?.();
      }}
    >
      {children}
    </form>
  );
}
