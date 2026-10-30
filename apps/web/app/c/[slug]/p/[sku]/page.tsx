import { parseImageRef } from "@cataloglink/core/google";
import type { Metadata } from "next";
import { BackLink } from "@/components/ui";
import { SHOW_CATALOGS } from "@/lib/features";
import { notFound } from "next/navigation";
import { getCatalogContext, getCatalogProduct, getCatalogSnapshot } from "@/lib/catalog";
import { CatalogFooter, CatalogHeader } from "../../_components/catalog-header";
import { ProductCard } from "../../_components/product-card";
import { qtyLabel, rupees, unitLabel } from "../../_components/price";
import { BuyBox } from "./buy-box";
import { Gallery } from "./gallery";
import { ShareButton } from "./share-button";
import { Video } from "./video";
import { publicBaseUrl } from "@/lib/public-url";

type Props = { params: Promise<{ slug: string; sku: string }> };

async function load(params: Props["params"]) {
  const { slug, sku } = await params;
  const ctx = await getCatalogContext(slug);
  if (!ctx) return null;
  const product = await getCatalogProduct(ctx, decodeURIComponent(sku));
  return product ? { ctx, product } : null;
}

/** YouTube and Google Drive videos can be embedded; other links open in a new tab. */
function videoEmbed(url: string) {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}?autoplay=1`;
  const ref = parseImageRef(url);
  if (ref?.kind === "file") return `https://drive.google.com/file/d/${ref.id}/preview`;
  return null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await load(params);
  if (!data) return { title: "Product not available", robots: { index: false } };
  const { ctx, product: p } = data;
  const description = [
    p.price !== null && `${rupees(p.price)} / ${unitLabel(p.priceType)}`,
    p.fabric,
    `Min. order ${qtyLabel(p.moq, p.priceType)}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const image = p.images[0]?.fullUrl;
  return {
    title: { absolute: `${p.name} – ${ctx.client.businessName}` },
    description,
    robots: { index: false },
    openGraph: {
      title: p.name,
      description,
      siteName: ctx.client.businessName,
      images: image ? [{ url: `${await publicBaseUrl()}${image}`, width: 1200 }] : undefined,
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const data = await load(params);
  if (!data) notFound();
  const { ctx, product: p } = data;
  const base = `/c/${ctx.link.slug}`;
  const url = `${await publicBaseUrl()}${base}/p/${encodeURIComponent(p.sku)}`;
  const { items, lowStockThreshold } = await getCatalogSnapshot(ctx);
  // Group by catalog name when catalogs are shown (lib/features.ts), otherwise by category.
  const group = SHOW_CATALOGS ? p.catalogName : null;
  const related = items
    .filter((i) => i.id !== p.id && (group ? i.catalogName === group : i.category === p.category))
    .slice(0, 8);
  const out = p.availableQty <= 0;
  const low = !out && lowStockThreshold > 0 && p.availableQty <= lowStockThreshold;

  const specs: [string, string | null][] = [
    ["Fabric", p.fabric],
    ["Colours", p.colours.join(", ") || null],
    ["Sizes", p.sizes.join(", ") || null],
    ["Pieces per set", p.piecesPerSet ? String(p.piecesPerSet) : null],
    ["Minimum order", qtyLabel(p.moq, p.priceType)],
    ["GST", p.gstPct !== null ? `${p.gstPct}%` : null],
  ];

  return (
    <div className="min-h-dvh bg-stone-50">
      <CatalogHeader ctx={ctx} url={`${await publicBaseUrl()}${base}`} compact />
      <main className="mx-auto max-w-6xl px-4 pt-4 pb-28 md:pb-6">
        <BackLink
          href={group ? `${base}/catalog/${encodeURIComponent(group)}` : base}
          label={group ?? "All products"}
          className="mb-3"
        />

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:gap-10">
          <Gallery images={p.images} name={p.name} />

          <div className="min-w-0 space-y-5">
            <div>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {p.isNew && (
                  <span className="rounded-full bg-blue-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                    New
                  </span>
                )}
                {out && (
                  <span className="rounded-full bg-stone-900 px-2.5 py-0.5 text-xs font-semibold text-white">
                    Out of stock
                  </span>
                )}
                {low && (
                  <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-semibold text-white">
                    Only {p.availableQty} left
                  </span>
                )}
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-xl font-semibold sm:text-2xl">{p.name}</h1>
                  <p className="mt-0.5 text-sm text-stone-500">Code {p.sku}</p>
                </div>
                <ShareButton title={`${p.name} – ${ctx.client.businessName}`} url={url} />
              </div>
              {p.price !== null ? (
                <p className="mt-3">
                  <span className="text-2xl font-semibold">{rupees(p.price)}</span>
                  <span className="text-sm text-stone-500"> / {unitLabel(p.priceType)}</span>
                  {p.listPrice !== null ? (
                    <>
                      <span className="ml-2 text-sm text-stone-400 line-through">{rupees(p.listPrice)}</span>
                      <span className="ml-2 rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">
                        {p.discountLabel}
                      </span>
                    </>
                  ) : (
                    p.mrp !== null &&
                    p.mrp > p.price && (
                      <span className="ml-2 text-sm text-stone-400 line-through">MRP {rupees(p.mrp)}</span>
                    )
                  )}
                  {p.gstPct ? (
                    <span className="block text-xs text-stone-500">+ {p.gstPct}% GST</span>
                  ) : null}
                </p>
              ) : (
                <p className="mt-3 text-lg font-semibold text-brand-700">Price on request</p>
              )}
            </div>

            <BuyBox
              sellerWhatsapp={ctx.client.whatsapp}
              productUrl={url}
              cart={
                ctx.link.allowOrdering
                  ? {
                      linkId: ctx.link.id,
                      slug: ctx.link.slug,
                      productId: p.id,
                      imageUrl: p.images[0]?.thumbUrl ?? null,
                    }
                  : null
              }
              product={{
                name: p.name,
                sku: p.sku,
                price: p.price,
                priceType: p.priceType,
                piecesPerSet: p.piecesPerSet,
                moq: p.moq,
                availableQty: p.availableQty,
                colours: p.colours,
                sizes: p.sizes,
                gstPct: p.gstPct,
              }}
            />

            {p.videoUrl && <Video url={p.videoUrl} embedUrl={videoEmbed(p.videoUrl)} />}

            {p.description && (
              <p className="text-sm whitespace-pre-line text-stone-700">{p.description}</p>
            )}

            <section>
              <h2 className="mb-2 text-sm font-semibold">Details</h2>
              <dl className="divide-y divide-stone-200 rounded-2xl bg-white px-4 text-sm ring-1 ring-stone-200">
                {specs
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k} className="grid grid-cols-5 gap-2 py-2.5">
                      <dt className="col-span-2 text-stone-500">{k}</dt>
                      <dd className="col-span-3">{v}</dd>
                    </div>
                  ))}
              </dl>
            </section>
          </div>
        </div>

        {related.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 text-base font-semibold">
              {group ? `More from ${group}` : `More ${p.category}`}
            </h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
              {related.map((item) => (
                <li key={item.id}>
                  <ProductCard
                    item={item}
                    slug={ctx.link.slug}
                    lowStockThreshold={lowStockThreshold}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <CatalogFooter ctx={ctx} />
    </div>
  );
}
