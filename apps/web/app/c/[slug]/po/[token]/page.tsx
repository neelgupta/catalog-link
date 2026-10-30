import { CircleCheck } from "lucide-react";
import { CUSTOMER_STATUS, PAYMENT_MODE_LABEL } from "@cataloglink/core/orders";
import { parseBankDetails } from "@cataloglink/core/profile";
import { prisma } from "@cataloglink/db";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCatalogContext } from "@/lib/catalog";
import { formatDateTime } from "@/lib/format";
import { orderFromPoToken } from "@/lib/po";
import { publicBaseUrl } from "@/lib/public-url";
import { CatalogHeader } from "../../_components/catalog-header";
import { PaymentDetails } from "../../_components/payment-details";
import { qtyLabel, rupees, unitLabel } from "../../_components/price";
import { RememberOrder } from "./remember-order";

export const metadata: Metadata = { title: "Purchase Order", robots: { index: false } };

type Props = { params: Promise<{ slug: string; token: string }>; searchParams: Promise<{ placed?: string }> };

/** The customer's Purchase Order (PO) slip, opened by its private link. */
export default async function PoPage({ params, searchParams }: Props) {
  const { slug, token } = await params;
  const ctx = await getCatalogContext(slug);
  if (!ctx) notFound();
  const order = await orderFromPoToken(ctx, token);
  if (!order) notFound();
  const { placed } = await searchParams;
  const client = await prisma.client.findUniqueOrThrow({
    where: { id: ctx.client.id },
    select: { businessName: true, address: true, city: true, gst: true, upiId: true, upiQrUrl: true, bankDetails: true },
  });
  const showPrice = order.link?.showPrice ?? true;
  const closed = order.status === "CANCELLED" || order.status === "REJECTED";
  const base = `/c/${ctx.link.slug}`;
  const pdfUrl = `/api/v1/public/c/${ctx.link.slug}/po/${token}/pdf`;

  return (
    <div className="min-h-dvh bg-stone-50">
      <CatalogHeader ctx={ctx} url={`${await publicBaseUrl()}${base}`} compact />
      <RememberOrder slug={ctx.link.slug} orderNo={order.orderNo} url={`${base}/po/${token}`} />
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5">
        {placed && (
          <div role="status" className="rounded-2xl bg-green-50 p-4 text-green-900 ring-1 ring-green-200">
            <p className="text-lg font-semibold">Order placed. Thank you!</p>
            <p className="mt-1 text-sm">
              {client.businessName} has your order. Your Purchase Order is below. You can find it any time in My orders.
            </p>
          </div>
        )}

        <article className="rounded-2xl bg-white p-4 ring-1 ring-stone-200 sm:p-6">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-100 pb-4">
            <div>
              <p className="text-xs font-semibold tracking-wide text-stone-500 uppercase">Purchase Order</p>
              <h1 className="text-2xl font-semibold">PO No. {order.orderNo}</h1>
              <p className="text-sm text-stone-500">{formatDateTime(order.createdAt)}</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${closed ? "bg-stone-200 text-stone-700" : "bg-blue-100 text-blue-800"}`}>
              {CUSTOMER_STATUS[order.status]}
            </span>
          </header>

          {closed && order.rejectReason && <p className="mt-4 rounded-lg bg-stone-100 px-3 py-2 text-sm">Reason: {order.rejectReason}</p>}

          <div className="grid gap-4 border-b border-stone-100 py-4 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold tracking-wide text-stone-500 uppercase">Supplier</p>
              <p className="font-medium">{client.businessName}</p>
              {client.address && <p className="text-stone-600">{client.address}</p>}
              <p className="text-stone-600">{client.city}</p>
              {client.gst && <p className="text-stone-600">GSTIN: {client.gst}</p>}
            </div>
            <div>
              <p className="text-xs font-semibold tracking-wide text-stone-500 uppercase">Buyer</p>
              <p className="font-medium">
                {order.customerName}
                {order.shopName ? `, ${order.shopName}` : ""}
              </p>
              <p className="text-stone-600">{order.mobile}</p>
              {order.gst && <p className="text-stone-600">GSTIN: {order.gst}</p>}
              {order.deliveryAddress && <p className="text-stone-600">{order.deliveryAddress}</p>}
            </div>
          </div>

          <ul className="divide-y divide-stone-100">
            {order.items.map((i, n) => (
              <li key={i.id} className="flex gap-3 py-3 text-sm">
                <span className="w-5 shrink-0 text-stone-400">{n + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{i.name}</p>
                  <p className="text-xs text-stone-500">{[i.sku, i.colour, i.size && `Size ${i.size}`].filter(Boolean).join(" · ")}</p>
                  <p className="text-stone-600">
                    {qtyLabel(i.qty, i.priceType)}
                    {showPrice && (
                      <>
                        {" × "}
                        {i.listPrice !== null && <span className="text-stone-400 line-through">{rupees(Number(i.listPrice))}</span>}{" "}
                        <span className={i.listPrice !== null ? "font-medium text-green-700" : ""}>{rupees(Number(i.unitPrice))}</span> /{" "}
                        {unitLabel(i.priceType)}
                      </>
                    )}
                    {showPrice && i.gstPct ? <span className="text-stone-400"> + {Number(i.gstPct)}% GST</span> : null}
                  </p>
                </div>
                {showPrice && <span className="shrink-0 font-semibold tabular-nums">{rupees(Number(i.lineTotal))}</span>}
              </li>
            ))}
          </ul>

          {showPrice ? (
            <dl className="ml-auto max-w-xs space-y-1 border-t border-stone-100 pt-3 text-sm">
              <div className="flex justify-between text-stone-600">
                <dt>Subtotal</dt>
                <dd className="tabular-nums">{rupees(Number(order.subtotal))}</dd>
              </div>
              <div className="flex justify-between text-stone-600">
                <dt>GST</dt>
                <dd className="tabular-nums">{rupees(Number(order.gstTotal))}</dd>
              </div>
              <div className="flex justify-between text-base font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{rupees(Number(order.grandTotal))}</dd>
              </div>
            </dl>
          ) : (
            <p className="border-t border-stone-100 pt-3 text-sm text-stone-600">Prices and the total will be confirmed by the supplier.</p>
          )}
        </article>

        {!closed && (
          <section className="space-y-2 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
            <h2 className="text-base font-semibold">Payment: {PAYMENT_MODE_LABEL[order.paymentMode]}</h2>
            {order.paymentReceived ? (
              <p className="flex items-center gap-1 text-sm font-medium text-green-700"><CircleCheck aria-hidden="true" className="size-4" /> Payment received</p>
            ) : (
              <PaymentDetails mode={order.paymentMode} payment={{ upiId: client.upiId, upiQrUrl: client.upiQrUrl, bank: parseBankDetails(client.bankDetails) }} />
            )}
          </section>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <a href={pdfUrl} className="flex h-12 items-center justify-center rounded-full bg-brand-500 sm:flex-1 text-sm font-semibold text-white hover:bg-brand-600">
            Download PO (PDF)
          </a>
          <Link href={base} className="flex h-12 items-center justify-center rounded-full bg-white sm:flex-1 text-sm font-semibold ring-1 ring-stone-300 hover:bg-stone-50">
            Continue shopping
          </Link>
        </div>
      </main>
    </div>
  );
}
