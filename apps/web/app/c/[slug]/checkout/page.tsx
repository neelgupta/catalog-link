import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCatalogContext } from "@/lib/catalog";
import { publicBaseUrl } from "@/lib/public-url";
import { CatalogHeader } from "../_components/catalog-header";
import { CheckoutView } from "./checkout-view";

export const metadata: Metadata = { title: "Place order", robots: { index: false } };

export default async function CheckoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await getCatalogContext((await params).slug);
  if (!ctx) notFound();
  return (
    <div className="min-h-dvh bg-stone-50">
      <CatalogHeader ctx={ctx} url={`${await publicBaseUrl()}/c/${ctx.link.slug}`} compact />
      <main className="mx-auto max-w-3xl px-4 py-5">
        <h1 className="mb-4 text-xl font-semibold">Place order</h1>
        <CheckoutView slug={ctx.link.slug} linkId={ctx.link.id} allowOrdering={ctx.link.allowOrdering} />
      </main>
    </div>
  );
}
