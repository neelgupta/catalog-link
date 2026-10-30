"use client";

import type { CatalogItem } from "@cataloglink/core/catalog";
import { useEffect, useRef, useState } from "react";
import { ProductCard } from "./product-card";

/** First page comes from the server; the rest loads as the customer scrolls. */
export function CatalogGrid({
  slug,
  initial,
  nextCursor: firstCursor,
  query,
  lowStockThreshold,
}: {
  slug: string;
  initial: CatalogItem[];
  nextCursor: number | null;
  /** Current filters as URL params, sent with every "load more" request. */
  query: string;
  lowStockThreshold: number;
}) {
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(firstCursor);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const sentinel = useRef<HTMLDivElement>(null);

  const loadMore = async () => {
    if (cursor === null || state === "loading") return;
    setState("loading");
    try {
      const params = new URLSearchParams(query);
      params.set("cursor", String(cursor));
      const res = await fetch(`/api/v1/public/c/${slug}/products?${params}`);
      if (!res.ok) throw new Error(String(res.status));
      const data: { items: CatalogItem[]; nextCursor: number | null } = await res.json();
      setItems((cur) => [...cur, ...data.items.filter((n) => !cur.some((c) => c.id === n.id))]);
      setCursor(data.nextCursor);
      setState("idle");
    } catch {
      setState("error");
    }
  };

  useEffect(() => {
    const el = sentinel.current;
    if (!el || cursor === null || state !== "idle") return;
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && loadMore(), {
      rootMargin: "800px",
    });
    io.observe(el);
    return () => io.disconnect();
    // loadMore reads the latest state through this effect's dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, state]);

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
        {items.map((item, i) => (
          <li key={item.id}>
            <ProductCard
              item={item}
              slug={slug}
              lowStockThreshold={lowStockThreshold}
              priority={i < 4}
            />
          </li>
        ))}
      </ul>
      {cursor !== null && (
        <div ref={sentinel} className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={state === "loading"}
            className="h-10 rounded-full bg-white px-5 text-sm font-medium ring-1 ring-stone-300 hover:bg-stone-50 disabled:opacity-60"
          >
            {state === "loading"
              ? "Loading…"
              : state === "error"
                ? "Couldn't load. Try again"
                : "Show more"}
          </button>
        </div>
      )}
    </>
  );
}
