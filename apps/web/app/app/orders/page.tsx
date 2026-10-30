import { Check, Download, ListFilter, X } from "lucide-react";
import { listOrders, OPEN_STATUSES, ORDER_TABS, type OrderTab } from "@cataloglink/core/orders";
import { forClient } from "@cataloglink/db";
import type { Metadata } from "next";
import Link from "next/link";
import { LiveForm } from "@/components/live-form";
import { buttonClass, EmptyState, PageHeader, SearchField } from "@/components/ui";
import { requireClient } from "@/lib/auth";
import { formatDate, formatDateTime, formatRupees } from "@/lib/format";
import { OrderStatusBadge, PAYMENT_LABEL } from "./status-badge";

export const metadata: Metadata = { title: "Orders" };

const PAGE_SIZE = 25;
const inputClass = "h-10 w-full min-w-0 rounded-xl border border-stone-300 bg-white px-3 text-base outline-none focus:border-brand-500 sm:text-sm";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; from?: string; to?: string; link?: string; page?: string }>;
}) {
  const { clientId } = await requireClient();
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const from = sp.from ?? "";
  const to = sp.to ?? "";
  const page = Math.max(1, Number(sp.page) || 1);
  const links = await forClient(clientId).catalogLink.findMany({ orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }], select: { id: true, name: true } });
  const link = links.some((l) => l.id === sp.link) ? sp.link! : "";
  const requested = sp.status && sp.status in ORDER_TABS ? (sp.status as OrderTab) : null;

  // Open on "New" when something is waiting, otherwise on "All".
  let tab: OrderTab = requested ?? "new";
  let data = await listOrders(clientId, { tab, q, from, to, linkId: link || undefined }, page, PAGE_SIZE);
  if (!requested && data.counts.new === 0) {
    tab = "all";
    data = await listOrders(clientId, { tab, q, from, to, linkId: link || undefined }, page, PAGE_SIZE);
  }
  const { orders, total, counts } = data;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = Boolean(q || from || to || link);
  const activeFilters = [link, from, to].filter(Boolean).length;
  const day = (d: string) => formatDate(new Date(`${d}T00:00:00+05:30`));
  const chips: { label: string; remove: Record<string, string> }[] = [
    ...(q ? [{ label: `“${q}”`, remove: { q: "" } }] : []),
    ...(link ? [{ label: `via ${links.find((l) => l.id === link)?.name}`, remove: { link: "" } }] : []),
    ...(from ? [{ label: `From ${day(from)}`, remove: { from: "" } }] : []),
    ...(to ? [{ label: `To ${day(to)}`, remove: { to: "" } }] : []),
  ];

  const query = (patch: Record<string, string | number | undefined>) => {
    const params = { status: tab, q, from, to, link, page: "", ...patch };
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
          <a href={exportHref} className={buttonClass("secondary", "px-3 sm:px-4")} aria-label="Export to Excel" title="Export to Excel">
            <Download aria-hidden="true" className="size-4" />
            <span className="hidden sm:inline">Export Excel</span>
          </a>
        }
      />

      <LiveForm action="/app/orders" className="mb-3 rounded-2xl border border-stone-200 bg-white p-3 sm:p-4">
        <input type="hidden" name="status" value={tab} />
        {/* One set of fields: the Filters button shows them on phones; always visible from md up. */}
        <input id="order-filters" type="checkbox" className="peer sr-only" />
        <div className="flex gap-2">
          <SearchField className="flex-1" defaultValue={q} placeholder="Order no., customer, mobile…" aria-label="Search orders" />
          <label
            htmlFor="order-filters"
            className={`inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-4 text-sm font-semibold ring-1 md:hidden ${
              activeFilters ? "bg-brand-50 text-brand-700 ring-brand-500" : "bg-white text-stone-700 ring-stone-300"
            }`}
          >
            <ListFilter aria-hidden="true" className="size-4" />
            Filters{activeFilters ? ` (${activeFilters})` : ""}
          </label>
        </div>
        <div className="mt-3 hidden gap-3 border-t border-stone-100 pt-3 peer-checked:grid md:grid md:grid-cols-[16rem_auto_auto] md:items-end md:justify-start md:border-0 md:pt-0">
          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium text-stone-500">Catalog link</span>
            <select name="link" defaultValue={link} className={inputClass}>
              <option value="">All catalog links</option>
              {links.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3 md:contents">
            <label className="block min-w-0">
              <span className="mb-1 block text-xs font-medium text-stone-500">From date</span>
              <input name="from" type="date" defaultValue={from} className={`${inputClass} md:w-40`} />
            </label>
            <label className="block min-w-0">
              <span className="mb-1 block text-xs font-medium text-stone-500">To date</span>
              <input name="to" type="date" defaultValue={to} className={`${inputClass} md:w-40`} />
            </label>
          </div>
          {filtered && (
            <Link href={`/app/orders?status=${tab}`} className={buttonClass("secondary", "md:hidden")}>
              Clear filters
            </Link>
          )}
        </div>
      </LiveForm>

      {filtered && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          {chips.map((c) => (
            <Link
              key={c.label}
              href={href({ ...c.remove, page: undefined })}
              aria-label={`Remove filter: ${c.label}`}
              className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-stone-700 ring-1 ring-stone-300 hover:bg-stone-100"
            >
              {c.label} <X aria-hidden="true" className="size-3.5" />
            </Link>
          ))}
          <Link href={`/app/orders?status=${tab}`} className="text-stone-500 underline">
            Clear all
          </Link>
        </div>
      )}

      <nav aria-label="Order status" className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {(Object.keys(ORDER_TABS) as OrderTab[]).map((t) => (
          <Link
            key={t}
            href={href({ status: t, page: undefined })}
            aria-current={t === tab ? "page" : undefined}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm whitespace-nowrap transition ${
              t === tab ? "bg-stone-900 text-white" : "bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-100"
            }`}
          >
            {ORDER_TABS[t]!.label}
            <span
              className={`min-w-5 rounded-full px-1.5 text-center text-xs tabular-nums ${
                t === tab ? "bg-white/20 text-white" : t === "new" && counts.new ? "bg-brand-500 font-semibold text-white" : "bg-stone-100 text-stone-500"
              }`}
            >
              {counts[t]}
            </span>
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
                : `No ${ORDER_TABS[tab]!.label.toLowerCase()} orders.`}
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
                <tr key={o.id} className={`relative hover:bg-stone-50 ${OPEN_STATUSES.includes(o.status) ? "bg-blue-50/40" : ""}`}>
                  <td className="px-4 py-3">
                    <Link href={`/app/orders/${o.id}`} className="font-semibold after:absolute after:inset-0">
                      #{o.orderNo}
                    </Link>
                    <p className="text-xs text-stone-500">{formatDateTime(o.createdAt)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{o.customerName}</p>
                    <p className="text-xs text-stone-500">{[o.shopName, o.city, o.mobile].filter(Boolean).join(" · ")}</p>
                    {o.link && <p className="mt-0.5 text-xs text-brand-700">via {o.link.name}</p>}
                  </td>
                  <td className="px-4 py-3 text-stone-600">{o._count.items}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatRupees(o.grandTotal)}</td>
                  <td className="px-4 py-3 text-stone-600">
                    {PAYMENT_LABEL[o.paymentMode]}
                    {o.paymentReceived && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs font-medium text-green-700">
                        <Check aria-hidden="true" className="size-3.5" /> paid
                      </span>
                    )}
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
                <Link href={`/app/orders/${o.id}`} className={`block rounded-2xl border bg-white p-4 ${OPEN_STATUSES.includes(o.status) ? "border-blue-200" : "border-stone-200"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        #{o.orderNo} · {o.customerName}
                      </p>
                      <p className="truncate text-xs text-stone-500">{[o.shopName, o.city].filter(Boolean).join(" · ") || o.mobile}</p>
                      {o.link && <p className="truncate text-xs text-brand-700">via {o.link.name}</p>}
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
