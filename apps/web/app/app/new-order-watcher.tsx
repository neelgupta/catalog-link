"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const EVERY_MS = 30_000;

/**
 * Checks for new orders every 30 s while the dashboard is open. When the count changes, the page
 * refreshes (the Orders badge and lists update) and the tab title shows the count.
 */
export function NewOrderWatcher({ initial }: { initial: number }) {
  const router = useRouter();
  const last = useRef(initial);

  useEffect(() => {
    last.current = initial;
    const base = document.title.replace(/^\(\d+\+?\) /, "");
    document.title = initial ? `(${initial}) ${base}` : base;
  }, [initial]);

  useEffect(() => {
    const check = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/v1/client/orders/new-count", { cache: "no-store" });
        if (!res.ok) return;
        const { count } = (await res.json()) as { count: number };
        if (count !== last.current) {
          last.current = count;
          router.refresh();
        }
      } catch {
        /* offline: try again next time */
      }
    };
    const timer = setInterval(check, EVERY_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [router]);

  return null;
}
