"use client";

import { Play } from "lucide-react";
import { useState } from "react";

/** Loads the embedded player only when asked, to keep the page light on slow networks. */
export function Video({ embedUrl, url }: { embedUrl: string | null; url: string }) {
  const [open, setOpen] = useState(false);
  if (!embedUrl) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-medium ring-1 ring-stone-300"
      >
        <Play aria-hidden="true" className="size-4" /> Watch video
      </a>
    );
  }
  return open ? (
    <iframe
      src={embedUrl}
      title="Product video"
      allow="autoplay; encrypted-media; picture-in-picture"
      allowFullScreen
      className="aspect-video w-full rounded-xl bg-black"
    />
  ) : (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-medium ring-1 ring-stone-300"
    >
      <Play aria-hidden="true" className="size-4" /> Play video
    </button>
  );
}
