import { linkProductWhere } from "@cataloglink/core/links";
import { isNewArrival } from "@cataloglink/core/products";
import { getClientSettings } from "@cataloglink/core/profile";
import { forClient } from "@cataloglink/db";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, Detail, PageHeader } from "@/components/ui";
import { requireClient } from "@/lib/auth";
import { formatDateTime, formatRupees } from "@/lib/format";
import { HideToggle } from "../hide-toggle";
import { isOnLinks, priceUnit, ProductBadges } from "../product-status";

export const metadata: Metadata = { title: "Product" };

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { clientId } = await requireClient();
  const { id } = await params;
  const db = forClient(clientId);
  const product = await db.product.findFirst({
    where: { id },
    include: { images: { orderBy: { position: "asc" } } },
  });
  if (!product) notFound();

  const [settings, links] = await Promise.all([
    getClientSettings(clientId),
    db.catalogLink.findMany({ orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }),
  ]);
  const onLinks = isOnLinks(product, settings);
  // Links whose product selection includes this product.
  const linkHits = await Promise.all(
    links.map(async (l) => ({ link: l, hit: (await db.product.count({ where: { id: product.id, ...linkProductWhere(l) } })) > 0 })),
  );
  const isNew = isNewArrival(product, settings.effectiveNewArrivalDays);
  const ready = product.images.filter((i) => i.status === "READY" && i.fullUrl);
  const problems = product.images.filter((i) => i.status === "FAILED");

  return (
    <>
      <PageHeader
        back={{ href: "/app/products", label: "Products" }}
        title={product.name}
        subtitle={`${product.sku} · row ${product.sheetRow} in your sheet`}
      />

      {product.removedFromSheetAt && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This product was removed from your sheet on {formatDateTime(product.removedFromSheetAt)} and no longer shows on any link.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section aria-label="Customer preview" className="min-w-0 overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <p className="border-b border-stone-100 px-4 py-2 text-xs font-medium tracking-wide text-stone-500 uppercase">
            Preview: how customers see it
          </p>
          {ready.length ? (
            <div className="flex snap-x snap-mandatory overflow-x-auto">
              {ready.map((img, i) => (
                // eslint-disable-next-line @next/next/no-img-element -- already resized WebP from /media
                <img
                  key={img.id}
                  src={img.fullUrl!}
                  alt={`${product.name} photo ${i + 1}`}
                  className="aspect-[3/4] w-full shrink-0 snap-center bg-stone-100 bg-cover object-cover"
                  style={img.blurDataUrl ? { backgroundImage: `url(${img.blurDataUrl})` } : undefined}
                />
              ))}
            </div>
          ) : (
            <div className="flex aspect-[3/4] items-center justify-center bg-stone-100 text-sm text-stone-400">
              {product.images.length ? "Photos are being processed…" : "No photos"}
            </div>
          )}
          {ready.length > 1 && <p className="pt-2 text-center text-xs text-stone-400">Swipe for {ready.length} photos</p>}

          <div className={`space-y-3 p-4 ${onLinks ? "" : "opacity-60"}`}>
            <div className="flex flex-wrap gap-1">
              {isNew && <Badge tone="blue">New</Badge>}
              {product.availableQty <= 0 ? (
                <Badge tone="red">Out of stock</Badge>
              ) : settings.lowStockThreshold > 0 && product.availableQty <= settings.lowStockThreshold ? (
                <Badge tone="amber">Only {product.availableQty} left</Badge>
              ) : null}
            </div>
            <h2 className="text-lg font-semibold">{product.name}</h2>
            <p>
              <span className="text-xl font-semibold">{formatRupees(product.price)}</span>{" "}
              <span className="text-sm text-stone-500">{priceUnit(product.priceType)}</span>
              {product.mrp && Number(product.mrp) > Number(product.price) && (
                <span className="ml-2 text-sm text-stone-400 line-through">MRP {formatRupees(product.mrp)}</span>
              )}
            </p>
            <p className="text-sm text-stone-600">
              Minimum order: {product.moq} {product.priceType === "SET" ? (product.moq === 1 ? "set" : "sets") : product.moq === 1 ? "piece" : "pieces"}
              {product.piecesPerSet ? ` · ${product.piecesPerSet} pieces per set` : ""}
            </p>
            {product.colours.length > 0 && <Chips label="Colours" items={product.colours} />}
            {product.sizes.length > 0 && <Chips label="Sizes" items={product.sizes} />}
            {product.fabric && <p className="text-sm"><span className="text-stone-500">Fabric:</span> {product.fabric}</p>}
            {product.description && <p className="text-sm whitespace-pre-line text-stone-700">{product.description}</p>}
            <p className="text-xs text-stone-400">The full catalog page for customers arrives in the next milestone.</p>
          </div>
        </section>

        <div className="min-w-0 space-y-4">
          <Card title="On your links">
            <div className="space-y-3">
              <ProductBadges product={product} settings={settings} />
              {onLinks ? (
                <p className="text-sm text-green-700">Customers can see this product.</p>
              ) : (
                <p className="text-sm text-stone-600">
                  {!product.sheetActive
                    ? "Hidden because Active is “No” in your sheet. Change it in the sheet to show it."
                    : product.hiddenByClient
                      ? "You hid this product. It stays in your sheet."
                      : "Hidden because it is out of stock (Settings → out-of-stock products: hide)."}
                </p>
              )}
              {product.sheetActive && !product.removedFromSheetAt && <HideToggle productId={product.id} hidden={product.hiddenByClient} />}
              <ul className="divide-y divide-stone-100 text-sm">
                {linkHits.map(({ link, hit }) => (
                  <li key={link.id} className="flex items-center justify-between gap-2 py-2">
                    <Link href={`/app/links/${link.id}`} className="min-w-0 truncate hover:underline">
                      {link.name}
                    </Link>
                    {hit && onLinks && link.isActive ? <Badge tone="green">Shown</Badge> : <Badge tone="stone">Not included</Badge>}
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          <Card title="From your sheet">
            <dl className="divide-y divide-stone-100">
              <Detail label="SKU">{product.sku}</Detail>
              <Detail label="Category">{product.category}</Detail>
              <Detail label="Catalog">{product.catalogName}</Detail>
              <Detail label="Available qty">{product.availableQty}</Detail>
              <Detail label="GST">{product.gstPct ? `${product.gstPct}%` : null}</Detail>
              <Detail label="Tags">{product.tags.length ? product.tags.join(", ") : null}</Detail>
              <Detail label="Video">
                {product.videoUrl ? (
                  <a href={product.videoUrl} target="_blank" rel="noreferrer" className="text-brand-600 underline">
                    Open video
                  </a>
                ) : null}
              </Detail>
              <Detail label="First synced">{formatDateTime(product.firstSeenAt)}</Detail>
              <Detail label="Last changed">{formatDateTime(product.updatedAt)}</Detail>
            </dl>
          </Card>

          {problems.length > 0 && (
            <Card title="Photo problems">
              <ul className="space-y-2 text-sm">
                {problems.map((img) => (
                  <li key={img.id} className="rounded-lg bg-red-50 px-3 py-2 text-red-800">
                    Photo {img.position + 1}: {img.error ?? "Could not be loaded"}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Chips({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="text-sm">
      <span className="text-stone-500">{label}:</span>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {items.map((c) => (
          <span key={c} className="rounded-full border border-stone-300 px-2.5 py-0.5 text-xs">
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}
