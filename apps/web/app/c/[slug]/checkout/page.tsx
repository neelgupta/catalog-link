import { getEnv } from "@cataloglink/core/env";
import { findCustomer } from "@cataloglink/core/orders";
import { parseBankDetails } from "@cataloglink/core/profile";
import { prisma } from "@cataloglink/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCustomerSession } from "@/lib/auth";
import { getCatalogContext } from "@/lib/catalog";
import { publicBaseUrl } from "@/lib/public-url";
import { CatalogHeader } from "../_components/catalog-header";
import { CheckoutView } from "./checkout-view";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default async function CheckoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await getCatalogContext((await params).slug);
  if (!ctx) notFound();
  const [session, client] = await Promise.all([
    getCustomerSession(ctx.client.id),
    prisma.client.findUniqueOrThrow({ where: { id: ctx.client.id }, select: { paymentModes: true, upiId: true, upiQrUrl: true, bankDetails: true } }),
  ]);
  const customer = session ? await findCustomer(ctx.client.id, session.mobile) : null;

  return (
    <div className="min-h-dvh bg-stone-50">
      <CatalogHeader ctx={ctx} url={`${await publicBaseUrl()}/c/${ctx.link.slug}`} compact />
      <main className="mx-auto max-w-3xl px-4 py-5">
        <h1 className="mb-4 text-xl font-semibold">Checkout</h1>
        <CheckoutView
          slug={ctx.link.slug}
          linkId={ctx.link.id}
          allowOrdering={ctx.link.allowOrdering}
          mobile={session?.mobile ?? null}
          saved={customer && { name: customer.name, shopName: customer.shopName, city: customer.city, address: customer.address, gst: customer.gst }}
          paymentModes={client.paymentModes}
          payment={{ upiId: client.upiId, upiQrUrl: client.upiQrUrl, bank: parseBankDetails(client.bankDetails) }}
          devHint={getEnv().OTP_PROVIDER === "console"}
        />
      </main>
    </div>
  );
}
