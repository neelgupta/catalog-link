"use client";

import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useCartCount } from "./cart-store";

export function CartButton({ slug, linkId }: { slug: string; linkId: string }) {
  const count = useCartCount(linkId);
  return (
    <Link
      href={`/c/${slug}/cart`}
      aria-label={count ? `Cart, ${count} item${count === 1 ? "" : "s"}` : "Cart"}
      className="relative inline-flex size-11 items-center justify-center rounded-full bg-white text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50"
    >
      <ShoppingCart aria-hidden="true" className="size-5" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 flex min-w-5 items-center justify-center rounded-full bg-brand-500 px-1 text-[11px] font-semibold text-white">
          {count}
        </span>
      )}
    </Link>
  );
}
