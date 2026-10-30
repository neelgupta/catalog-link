"use client";

import { Share } from "lucide-react";
/** Share one product: the phone's share sheet when available, otherwise WhatsApp. */
export function ShareButton({ title, url }: { title: string; url: string }) {
  const text = `${title}\n${url}`;
  return (
    <button
      type="button"
      onClick={async () => {
        if (navigator.share) {
          try {
            await navigator.share({ title, url });
            return;
          } catch (err) {
            if ((err as Error).name === "AbortError") return;
          }
        }
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
      }}
      aria-label="Share"
      className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-white px-3.5 text-sm font-medium ring-1 ring-stone-300 hover:bg-stone-50"
    >
      <Share aria-hidden="true" className="size-4" />
      Share
    </button>
  );
}
