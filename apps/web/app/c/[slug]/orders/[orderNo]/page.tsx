import { getEnv } from "@cataloglink/core/env";
import { CUSTOMER_STATUS, getCustomerOrder, OPEN_STATUSES, PAYMENT_MODE_LABEL, SIMPLE_ORDER_FLOW } from "@cataloglink/core/orders";
import { parseBankDetails } from "@cataloglink/core/profile";
import { prisma } from "@cataloglink/db";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCustomerSession } from "@/lib/auth";
import { getCatalogContext } from "@/lib/catalog";
import { formatDateTime } from "@/lib/format";
import { publicBaseUrl } from "@/lib/public-url";
import { CatalogHeader } from "../../_components/catalog-header";
import { PaymentDetails } from "../../_components/payment-details";
import { qtyLabel, rupees, unitLabel } from "../../_components/price";
import { LoginGate } from "../login-gate";
import { StatusBadge } from "../status-badge";
import { CancelOrderButton } from "./cancel-button";

export const metadata: Metadata = { title: "Order", robots: { index: false } };

// Two steps for now (simple flow); the full one has five.
const STEPS = SIMPLE_ORDER_FLOW ? (["PLACED", "DELIVERED"] as const) : (["PLACED", "CONFIRMED", "PACKED", "DISPATCHED", "DELIVERED"] as const);
const shortDate = (d: Date) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(d);

type Props = { params: Promise<{ slug: string; orderNo: string }>; searchParams: Promise<{ placed?: string }> };

export default async function OrderPage({ params, searchParams }: Props) {
  const { slug, orderNo } = await params;
  const ctx = await getCatalogContext(slug);
  if (!ctx) notFound();
  const base = `/c/${ctx.link.slug}`;
  const header = <CatalogHeader ctx={ctx} url={`${await publicBaseUrl()}${base}`} compact />;
  const session = await getCustomerSession(ctx.client.id);
  if (!session) {
    return (
      <div className="min-h-dvh bg-stone-50">
        {header}
        <main className="mx-auto max-w-3xl px-4 py-8">
          <LoginGate slug={ctx.link.slug} devHint={getEnv().OTP_PROVIDER === "console"} />
        </main>
      </div>
    );
  }
  const no = Number(orderNo);
  const order = Number.isInteger(no) ? await getCustomerOrder(ctx.client.id, session.mobile, no) : null;
  if (!order) notFound();
  const { placed } = await searchParams;
  const client = await prisma.client.findUniqueOrThrow({ where: { id: ctx.client.id }, select: { upiId: true, upiQrUrl: true, bankDetails: true } });

  const showPrice = order.link?.showPrice ?? true;
  const closed = order.status === "CANCELLED" || order.status === "REJECTED";
  const reached = SIMPLE_ORDER_FLOW
    ? order.status === "DELIVERED"
      ? 1
      : OPEN_STATUSES.includes(order.status)
        ? 0
        : -1
    : (STEPS as readonly string[]).indexOf(order.status);
  const when = (status: string) => order.history.find((h) => h.toStatus === status)?.createdAt;

  return (
    <div className="min-h-dvh bg-stone-50">
      {header}
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5">
        <Link href={`${base}/orders`} className="text-sm text-stone-500 hover:text-stone-800">
          ← My orders
        </Link>

        {placed && !closed && (
          <div role="status" className="rounded-2xl bg-green-50 p-4 text-green-900 ring-1 ring-green-200">
            <p className="text-lg font-semibold">Order placed. Thank you!</p>
            <p className="mt-1 text-sm">
              {ctx.client.businessName} has received order #{order.orderNo} and will confirm it soon. You can check its status here any time.
            </p>
          </div>
        )}

        <section className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold">Order #{order.orderNo}</h1>
              <p className="text-xs text-stone-500">Placed {formatDateTime(order.createdAt)}</p>
            </div>
            <StatusBadge status={order.status} label={CUSTOMER_STATUS[order.status]} />
          </div>

          {closed ? (
            <p className="mt-3 rounded-lg bg-stone-100 px-3 py-2 text-sm text-stone-700">
              {order.status === "REJECTED" ? "The seller couldn't take this order." : "This order was cancelled."}
              {order.rejectReason ? ` Reason: ${order.rejectReason}` : ""}
            </p>
          ) : (
            <ol className={`mt-4 grid gap-1 ${STEPS.length === 2 ? "grid-cols-2" : "grid-cols-5"}`} aria-label="Order progress">
              {STEPS.map((s, i) => (
                <li key={s} className="text-center">
                  <span className={`mx-auto block h-1.5 rounded-full ${i <= reached ? "bg-brand-500" : "bg-stone-200"}`} />
                  <span className={`mt-1.5 block text-[11px] leading-tight ${i <= reached ? "font-medium text-stone-800" : "text-stone-400"}`}>{CUSTOMER_STATUS[s]}</span>
                  {when(s) && <span className="block text-[10px] text-stone-400">{shortDate(when(s)!)}</span>}
                </li>
              ))}
            </ol>
          )}
          {order.status === "PLACED" && (
            <div className="mt-4">
              <CancelOrderButton slug={ctx.link.slug} orderNo={order.orderNo} />
            </div>
          )}
        </section>

        <section className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
          <h2 className="mb-2 text-base font-semibold">Items</h2>
          <ul className="divide-y divide-stone-100">
            {order.items.map((i) => (
              <li key={i.id} className="flex gap-3 py-3">
                {i.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- thumbnail snapshot
                  <img src={i.imageUrl} alt="" className="h-20 w-15 shrink-0 rounded-lg bg-stone-100 object-cover" />
                ) : (
                  <span className="h-20 w-15 shrink-0 rounded-lg bg-stone-100" />
                )}
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">{i.name}</p>
                  <p className="text-xs text-stone-500">{[i.sku, i.colour, i.size && `Size ${i.size}`].filter(Boolean).join(" · ")}</p>
                  <p className="mt-1 text-stone-600">
                    {qtyLabel(i.qty, i.priceType)}
                    {showPrice && ` × ${rupees(Number(i.unitPrice))} / ${unitLabel(i.priceType)}`}
                  </p>
                </div>
                {showPrice && <span className="shrink-0 text-sm font-semibold">{rupees(Number(i.lineTotal))}</span>}
              </li>
            ))}
          </ul>
          {showPrice ? (
            <div className="space-y-1 border-t border-stone-100 pt-2 text-sm">
              <div className="flex justify-between text-stone-600">
                <span>Subtotal</span>
                <span>{rupees(Number(order.subtotal))}</span>
              </div>
              <div className="flex justify-between text-stone-600">
                <span>GST</span>
                <span>{rupees(Number(order.gstTotal))}</span>
              </div>
              <div className="flex justify-between text-base font-semibold">
                <span>Total</span>
                <span>{rupees(Number(order.grandTotal))}</span>
              </div>
            </div>
          ) : (
            <p className="border-t border-stone-100 pt-2 text-sm text-stone-600">The seller will share prices and the total.</p>
          )}
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-white p-4 text-sm ring-1 ring-stone-200">
            <h2 className="mb-2 text-base font-semibold">Delivery</h2>
            <p className="font-medium">
              {order.customerName}
              {order.shopName ? `, ${order.shopName}` : ""}
            </p>
            <p className="whitespace-pre-line text-stone-600">{order.deliveryAddress}</p>
            <p className="text-stone-600">
              {order.city} · {order.mobile}
            </p>
            {order.gst && <p className="text-stone-600">GSTIN: {order.gst}</p>}
            {order.transportPref && <p className="mt-2">Transport: {order.transportPref}</p>}
            {order.notes && <p className="mt-2 text-stone-600">Notes: {order.notes}</p>}
          </div>
          <div className="space-y-2 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
            <h2 className="text-base font-semibold">Payment: {PAYMENT_MODE_LABEL[order.paymentMode]}</h2>
            {order.paymentReceived ? (
              <p className="text-sm font-medium text-green-700">Payment received ✓</p>
            ) : (
              !closed && <PaymentDetails mode={order.paymentMode} payment={{ upiId: client.upiId, upiQrUrl: client.upiQrUrl, bank: parseBankDetails(client.bankDetails) }} />
            )}
          </div>
        </section>

        <Link href={base} className="block text-center text-sm text-stone-600 underline">
          Continue shopping
        </Link>
      </main>
    </div>
  );
}
