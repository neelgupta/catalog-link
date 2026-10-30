/** Shown for unknown or switched-off links, deactivated sellers and expired plans. */
export function CatalogNotAvailable({
  title = "Catalog not available",
  body = "This catalog link is not active. Please contact the seller.",
}: {
  title?: string;
  body?: string;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 text-center">
      <div className="max-w-sm">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-stone-100 text-2xl">
          🧵
        </div>
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-stone-500">{body}</p>
      </div>
    </main>
  );
}
