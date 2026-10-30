import { getOrder, STATUS_LABEL } from "@cataloglink/core/orders";
import { getClientSettings } from "@cataloglink/core/profile";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { requireClient } from "@/lib/auth";
import { formatDateTime, formatRupees } from "@/lib/format";
import { OrderStatusBadge, PAYMENT_LABEL } from "../status-badge";
import { PaymentToggle, StatusActions } from "./order-actions";

export const metadata: Metadata = { title: "Order" };

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { clientId } = await requireClient();
  const { id } = await params;
  const [order, settings] = await Promise.all([getOrder(clientId, id), getClientSettings(clientId)]);
  if (!order) notFound();
  const closed = order.status === "REJECTED" || order.status === "CANCELLED";
  const pdf = (type: "order" | "packing") => `/api/v1/client/orders/${order.id}/pdf?type=${type}`;

  return (
    <>
      <PageHeader
        back={{ href: "/app/orders", label: "Orders" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            Order #{order.orderNo} <OrderStatusBadge status={order.status} />
          </span>
        }
        subtitle={`Placed ${formatDateTime(order.createdAt)}${order.link ? ` on “${order.link.name}”` : ""}`}
        action={
          <div className="flex flex-wrap gap-2">
            <a href={pdf("order")} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium hover:bg-stone-50">
              Order PDF
            </a>
            <a href={pdf("packing")} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium hover:bg-stone-50">
              Packing slip
            </a>
          </div>
        }
      />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3 lg:gap-6">
        <div className="min-w-0 space-y-4 lg:col-span-2 lg:space-y-6">
          <Card title={`Items (${order.items.length})`}>
            <ul className="divide-y divide-stone-100">
              {order.items.map((i) => (
                <li key={i.id} className="flex gap-3 py-3 first:pt-0">
                  {i.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- thumbnail snapshot
                    <img src={i.imageUrl} alt="" className="h-20 w-15 shrink-0 rounded-lg bg-stone-100 object-cover" />
                  ) : (
                    <span className="h-20 w-15 shrink-0 rounded-lg bg-stone-100" />
                  )}
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">
                      {i.productId ? (
                        <Link href={`/app/products/${i.productId}`} className="hover:underline">
                          {i.name}
                        </Link>
                      ) : (
                        i.name
                      )}
                    </p>
                    <p className="text-xs text-stone-500">{[i.sku, i.colour, i.size && `Size ${i.size}`].filter(Boolean).join(" · ")}</p>
                    <p className="mt-1 text-stone-600">
                      {i.qty} {i.priceType === "SET" ? (i.qty === 1 ? "set" : "sets") : i.qty === 1 ? "piece" : "pieces"} × {formatRupees(i.unitPrice)}
                      {i.gstPct ? <span className="text-stone-400"> + {Number(i.gstPct)}% GST</span> : null}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{formatRupees(i.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-2 space-y-1 border-t border-stone-100 pt-3 text-sm">
              <div className="flex justify-between text-stone-600">
                <dt>Subtotal</dt>
                <dd className="tabular-nums">{formatRupees(order.subtotal)}</dd>
              </div>
              <div className="flex justify-between text-stone-600">
                <dt>GST</dt>
                <dd className="tabular-nums">{formatRupees(order.gstTotal)}</dd>
              </div>
              <div className="flex justify-between text-base font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatRupees(order.grandTotal)}</dd>
              </div>
            </dl>
          </Card>

          {(order.notes || order.transportPref) && (
            <Card title="From the customer">
              {order.transportPref && (
                <p className="text-sm">
                  <span className="text-stone-500">Transport preference:</span> {order.transportPref}
                </p>
              )}
              {order.notes && <p className="mt-2 text-sm whitespace-pre-line">{order.notes}</p>}
            </Card>
          )}

          <Card title="History">
            <ol className="space-y-3">
              {order.history.map((h) => (
                <li key={h.id} className="flex gap-3 text-sm">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
                  <div>
                    <p>
                      <span className="font-medium">{STATUS_LABEL[h.toStatus]}</span>
                      <span className="text-stone-500">
                        {" "}
                        · {formatDateTime(h.createdAt)} · {h.byCustomer ? "by the customer" : h.fromStatus ? "by you" : ""}
                      </span>
                    </p>
                    {h.note && <p className="text-stone-600">{h.note}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="min-w-0 space-y-4 lg:space-y-6">
          <Card title={closed ? STATUS_LABEL[order.status] : "Next step"}>
            {closed ? (
              <p className="text-sm text-stone-600">
                {order.status === "CANCELLED" && order.cancelledBy === "customer" ? "The customer cancelled this order." : "This order was closed."}
                {order.rejectReason ? ` Reason: ${order.rejectReason}` : ""}
              </p>
            ) : (
              <StatusActions orderId={order.id} status={order.status} />
            )}
          </Card>

          <Card title="Customer">
            <div className="space-y-1 text-sm">
              <p className="font-medium">
                {order.customerName}
                {order.shopName ? `, ${order.shopName}` : ""}
              </p>
              <p>
                <a href={`tel:+91${order.mobile}`} className="text-brand-700 hover:underline">
                  {order.mobile}
                </a>
              </p>
              {order.gst && <p className="text-stone-600">GSTIN: {order.gst}</p>}
              <p className="pt-2 text-xs font-medium tracking-wide text-stone-500 uppercase">Deliver to</p>
              <p className="whitespace-pre-line text-stone-700">{order.deliveryAddress}</p>
              {order.city && <p className="text-stone-700">{order.city}</p>}
              <p className="pt-2">
                <Link href={`/app/customers/${order.customerId}`} className="text-brand-700 hover:underline">
                  View customer ({order.customer._count.orders} order{order.customer._count.orders === 1 ? "" : "s"})
                </Link>
                {order.customer.isBlocked && <span className="ml-2 text-xs font-medium text-red-700">Blocked</span>}
              </p>
            </div>
          </Card>

          <Card title="Payment">
            <p className="text-sm">
              {PAYMENT_LABEL[order.paymentMode]} ·{" "}
              {order.paymentReceived ? <span className="font-medium text-green-700">Received ✓</span> : <span className="text-stone-600">Not received yet</span>}
            </p>
            {!closed && (
              <div className="mt-3">
                <PaymentToggle orderId={order.id} received={order.paymentReceived} />
              </div>
            )}
          </Card>

          {settings.writeOrdersTab && (
            <Card title="Google Sheet">
              <p className="text-sm text-stone-600">
                {order.sheetError ? (
                  <span className="text-red-700">Not written to your Orders tab: {order.sheetError} It will be retried.</span>
                ) : order.sheetWrittenAt ? (
                  `In your Orders tab (updated ${formatDateTime(order.sheetWrittenAt)}).`
                ) : (
                  "Being added to your Orders tab…"
                )}
              </p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
