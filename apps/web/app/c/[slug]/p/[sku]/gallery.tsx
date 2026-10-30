"use client";

import { useEffect, useRef, useState } from "react";

type Img = { thumbUrl: string; fullUrl: string; blurDataUrl: string | null };

/** Swipeable photos with dots and thumbnails; tap a photo for full screen with zoom. */
export function Gallery({ images, name }: { images: Img[]; name: string }) {
  const [index, setIndex] = useState(0);
  const [viewer, setViewer] = useState<number | null>(null);
  const strip = useRef<HTMLDivElement>(null);

  const goTo = (i: number) =>
    strip.current?.scrollTo({ left: i * strip.current.clientWidth, behavior: "smooth" });

  if (!images.length) {
    return (
      <div className="flex aspect-[3/4] items-center justify-center rounded-2xl bg-stone-100 text-sm text-stone-400">
        Photos coming soon
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <div
          ref={strip}
          className="flex snap-x snap-mandatory overflow-x-auto rounded-2xl bg-stone-100 [scrollbar-width:none]"
          onScroll={(e) =>
            setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))
          }
        >
          {images.map((img, i) => (
            <button
              key={img.fullUrl}
              type="button"
              onClick={() => setViewer(i)}
              className="aspect-[3/4] w-full shrink-0 snap-center bg-cover bg-center"
              style={img.blurDataUrl ? { backgroundImage: `url(${img.blurDataUrl})` } : undefined}
              aria-label={`Open photo ${i + 1} full screen`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized 1200px WebP */}
              <img
                src={img.fullUrl}
                alt={`${name} – photo ${i + 1}`}
                loading={i === 0 ? "eager" : "lazy"}
                fetchPriority={i === 0 ? "high" : undefined}
                className="size-full object-cover"
              />
            </button>
          ))}
        </div>
        {images.length > 1 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {images.map((img, i) => (
              <span
                key={img.fullUrl}
                className={`size-2 rounded-full ${i === index ? "bg-white" : "bg-white/50"}`}
              />
            ))}
          </div>
        )}
        <span className="pointer-events-none absolute top-3 right-3 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white">
          Tap to zoom
        </span>
      </div>

      {images.length > 1 && (
        <div className="hidden gap-2 sm:flex">
          {images.map((img, i) => (
            <button
              key={img.thumbUrl}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Show photo ${i + 1}`}
              className={`size-16 overflow-hidden rounded-lg ring-2 ${i === index ? "ring-brand-500" : "ring-transparent"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail */}
              <img src={img.thumbUrl} alt="" loading="lazy" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {viewer !== null && (
        <Viewer images={images} start={viewer} name={name} onClose={() => setViewer(null)} />
      )}
    </div>
  );
}

function Viewer({
  images,
  start,
  name,
  onClose,
}: {
  images: Img[];
  start: number;
  name: string;
  onClose: () => void;
}) {
  const [i, setI] = useState(start);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const img = images[i]!;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((v) => Math.min(images.length - 1, v + 1));
      if (e.key === "ArrowLeft") setI((v) => Math.max(0, v - 1));
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [images.length, onClose]);

  const step = (d: number) => {
    setZoom(null);
    setI((v) => Math.min(images.length - 1, Math.max(0, v + d)));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${name} photos`}
      className="fixed inset-0 z-50 flex flex-col bg-black"
    >
      <div className="flex items-center justify-between p-3 text-white">
        <span className="text-sm">
          {i + 1} / {images.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-white/15 px-4 py-1.5 text-sm"
        >
          Close
        </button>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element -- full size photo; pinch zoom works natively on phones */}
        <img
          src={img.fullUrl}
          alt={`${name} – photo ${i + 1}`}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setZoom((z) =>
              z
                ? null
                : {
                    x: ((e.clientX - r.left) / r.width) * 100,
                    y: ((e.clientY - r.top) / r.height) * 100,
                  },
            );
          }}
          className={`size-full object-contain transition-transform duration-200 ${zoom ? "scale-[2.5] cursor-zoom-out" : "cursor-zoom-in"}`}
          style={zoom ? { transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
        />
      </div>
      {images.length > 1 && (
        <div className="flex justify-between p-3">
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={i === 0}
            className="rounded-full bg-white/15 px-5 py-2 text-sm text-white disabled:opacity-30"
          >
            ← Previous
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={i === images.length - 1}
            className="rounded-full bg-white/15 px-5 py-2 text-sm text-white disabled:opacity-30"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
