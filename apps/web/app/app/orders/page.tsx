import { listOrders, ORDER_TABS, type OrderTab } from "@cataloglink/core/orders";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass, EmptyState, PageHeader } from "@/components/ui";
import { requireClient } from "@/lib/auth";
import { formatDateTime, formatRupees } from "@/lib/format";
import { OrderStatusBadge, PAYMENT_LABEL } from "./status-badge";

export const metadata: Metadata = { title: "Orders" };

const PAGE_SIZE = 25;
const inputClass = "h-10 w-full min-w-0 rounded-lg border border-stone-300 bg-white px-3 text-base outline-none focus:border-brand-500 sm:text-sm";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; from?: string; to?: string; page?: string }>;
}) {
  const { clientId } = await requireClient();
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const from = sp.from ?? "";
  const to = sp.to ?? "";
  const page = Math.max(1, Number(sp.page) || 1);
  const requested = sp.status && sp.status in ORDER_TABS ? (sp.status as OrderTab) : null;

  // Open on "New" when something is waiting, otherwise on "All".
  let tab: OrderTab = requested ?? "new";
  let data = await listOrders(clientId, { tab, q, from, to }, page, PAGE_SIZE);
  if (!requested && data.counts.new === 0) {
    tab = "all";
    data = await listOrders(clientId, { tab, q, from, to }, page, PAGE_SIZE);
  }
  const { orders, total, counts } = data;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = Boolean(q || from || to);

  const query = (patch: Record<string, string | number | undefined>) => {
    const params = { status: tab, q, from, to, page: "", ...patch };
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && !(k === "page" && Number(v) <= 1)) s.set(k, String(v));
    return s.toString();
  };
  const href = (patch: Record<string, string | number | undefined>) => `/app/orders?${query(patch)}`;
  const exportHref = `/api/v1/client/orders/export?${query({ page: undefined })}`;

  return (
    <>
      <PageHeader
        title="Orders"
        subtitle={counts.new ? `${counts.new} new order${counts.new === 1 ? "" : "s"} waiting for you` : "Orders placed on your catalog links"}
        action={
          <a href={exportHref} className={buttonClass("secondary")}>
            Export Excel
          </a>
        }
      />

      <form action="/app/orders" className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-stone-200 bg-white p-3 sm:p-4 md:grid-cols-[1fr_auto_auto_auto]">
        <input type="hidden" name="status" value={tab} />
        <input name="q" type="search" defaultValue={q} placeholder="Order no., customer, shop, mobile…" aria-label="Search orders" className={`${inputClass} col-span-2 md:col-span-1`} />
        <label className="flex items-center gap-2 text-sm text-stone-500">
          <span className="shrink-0">From</span>
          <input name="from" type="date" defaultValue={from} aria-label="From date" className={inputClass} />
        </label>
        <label className="flex items-center gap-2 text-sm text-stone-500">
          <span className="shrink-0">To</span>
          <input name="to" type="date" defaultValue={to} aria-label="To date" className={inputClass} />
        </label>
        <button className={buttonClass("primary", "col-span-2 md:col-span-1")}>Search</button>
      </form>

      <nav aria-label="Order status" className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-0.5">
        {(Object.keys(ORDER_TABS) as OrderTab[]).map((t) => (
          <Link
            key={t}
            href={href({ status: t, page: undefined })}
            aria-current={t === tab ? "page" : undefined}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm whitespace-nowrap transition ${
              t === tab ? "bg-stone-900 text-white" : "bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-100"
            }`}
          >
            {ORDER_TABS[t].label}
            <span className={`text-xs tabular-nums ${t === tab ? "text-white/70" : t === "new" && counts.new ? "font-semibold text-brand-600" : "text-stone-500"}`}>{counts[t]}</span>
          </Link>
        ))}
      </nav>

      {orders.length === 0 ? (
        <EmptyState>
          {filtered
            ? "No orders match this search."
            : tab === "new"
              ? "No new orders right now. New orders appear here automatically."
              : counts.all === 0
                ? "No orders yet. Share your catalog link with customers. Their orders will appear here."
                : `No ${ORDER_TABS[tab].label.toLowerCase()} orders.`}
        </EmptyState>
      ) : (
        <>
          <table className="hidden w-full overflow-hidden rounded-2xl border border-stone-200 bg-white text-sm lg:table">
            <thead className="bg-stone-50 text-left text-xs font-medium tracking-wide text-stone-500 uppercase">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {orders.map((o) => (
                <tr key={o.id} className={`relative hover:bg-stone-50 ${o.status === "PLACED" ? "bg-blue-50/40" : ""}`}>
                  <td className="px-4 py-3">
                    <Link href={`/app/orders/${o.id}`} className="font-semibold after:absolute after:inset-0">
                      #{o.orderNo}
                    </Link>
                    <p className="text-xs text-stone-500">{formatDateTime(o.createdAt)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{o.customerName}</p>
                    <p className="text-xs text-stone-500">{[o.shopName, o.city, o.mobile].filter(Boolean).join(" · ")}</p>
                  </td>
                  <td className="px-4 py-3 text-stone-600">{o._count.items}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatRupees(o.grandTotal)}</td>
                  <td className="px-4 py-3 text-stone-600">
                    {PAYMENT_LABEL[o.paymentMode]}
                    {o.paymentReceived && <span className="ml-1.5 text-xs font-medium text-green-700">✓ paid</span>}
                  </td>
                  <td className="px-4 py-3">
                    <OrderStatusBadge status={o.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="space-y-2 lg:hidden">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`/app/orders/${o.id}`} className={`block rounded-2xl border bg-white p-4 ${o.status === "PLACED" ? "border-blue-200" : "border-stone-200"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        #{o.orderNo} · {o.customerName}
                      </p>
                      <p className="truncate text-xs text-stone-500">{[o.shopName, o.city].filter(Boolean).join(" · ") || o.mobile}</p>
                    </div>
                    <OrderStatusBadge status={o.status} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-stone-500">
                      {o._count.items} item{o._count.items === 1 ? "" : "s"} · {formatDateTime(o.createdAt)}
                    </span>
                    <span className="font-semibold tabular-nums">{formatRupees(o.grandTotal)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link className={buttonClass("secondary")} href={href({ page: page - 1 })}>
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-stone-500">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link className={buttonClass("secondary")} href={href({ page: page + 1 })}>
              Next
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </>
  );
}
