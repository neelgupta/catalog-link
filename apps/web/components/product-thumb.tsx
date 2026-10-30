/** Pre-sized WebP thumbnail with its blur placeholder (thumbnails are already resized by the worker). */
export function ProductThumb({
  image,
  alt,
  className = "",
}: {
  image: { thumbUrl: string | null; blurDataUrl: string | null } | null | undefined;
  alt: string;
  className?: string;
}) {
  if (!image?.thumbUrl) {
    return (
      <div className={`flex items-center justify-center bg-stone-100 text-xs text-stone-400 ${className}`}>
        {image ? "Processing…" : "No photo"}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- already resized WebP from /media
    <img
      src={image.thumbUrl}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={`bg-stone-100 bg-cover bg-center object-cover ${className}`}
      style={image.blurDataUrl ? { backgroundImage: `url(${image.blurDataUrl})` } : undefined}
    />
  );
}
