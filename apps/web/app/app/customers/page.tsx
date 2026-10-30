import { listCustomers } from "@cataloglink/core/customers";
import type { Metadata } from "next";
import Link from "next/link";
import { LiveForm } from "@/components/live-form";
import { Badge, buttonClass, EmptyState, LinkButton, PageHeader, SearchField } from "@/components/ui";
import { requireClient } from "@/lib/auth";
import { formatDate, formatRupees } from "@/lib/format";

export const metadata: Metadata = { title: "Customers" };

const PAGE_SIZE = 30;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; blocked?: string; page?: string }> }) {
  const { clientId } = await requireClient();
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const blocked = sp.blocked === "1";
  const page = Math.max(1, Number(sp.page) || 1);
  const { customers, total } = await listCustomers(clientId, { q, blocked }, page, PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (patch: Record<string, string | number | undefined>) => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, blocked: blocked ? "1" : "", page: "", ...patch })) if (v && !(k === "page" && Number(v) <= 1)) s.set(k, String(v));
    return `/app/customers${s.size ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageHeader title="Customers" subtitle={`${total} customer${total === 1 ? "" : "s"}`} action={<LinkButton href="/app/customers/new">Add customer</LinkButton>} />

      <LiveForm action="/app/customers" className="mb-3">
        {blocked && <input type="hidden" name="blocked" value="1" />}
        <SearchField defaultValue={q} placeholder="Search name, shop, city, mobile…" aria-label="Search customers" />
      </LiveForm>
      <div className="mb-4 flex gap-2">
        {[
          ["All", ""],
          ["Blocked", "1"],
        ].map(([label, value]) => (
          <Link
            key={label}
            href={href({ blocked: value, page: undefined })}
            className={`rounded-full px-3 py-1 text-sm ${(value === "1") === blocked ? "bg-stone-900 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200"}`}
          >
            {label}
          </Link>
        ))}
      </div>

      {customers.length === 0 ? (
        <EmptyState>{q || blocked ? "No customers match." : "No customers yet. They're added automatically when they order, or you can add one."}</EmptyState>
      ) : (
        <>
          <table className="hidden w-full overflow-hidden rounded-2xl border border-stone-200 bg-white text-sm lg:table">
            <thead className="bg-stone-50 text-left text-xs font-medium tracking-wide text-stone-500 uppercase">
              <tr>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Mobile</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3 text-right">Orders</th>
                <th className="px-4 py-3 text-right">Total ordered</th>
                <th className="px-4 py-3">Last order</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {customers.map((c) => (
                <tr key={c.id} className="relative hover:bg-stone-50">
                  <td className="px-4 py-3">
                    <Link href={`/app/customers/${c.id}`} className="font-medium after:absolute after:inset-0">
                      {c.name}
                    </Link>
                    {c.shopName && <span className="text-stone-500"> · {c.shopName}</span>}
                    {c.isBlocked && (
                      <span className="ml-2">
                        <Badge tone="red">Blocked</Badge>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-stone-600 tabular-nums">{c.mobile}</td>
                  <td className="px-4 py-3 text-stone-600">{c.city ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.orderCount}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatRupees(c.totalSpent)}</td>
                  <td className="px-4 py-3 text-stone-600">{c.lastOrderAt ? formatDate(c.lastOrderAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white lg:hidden">
            {customers.map((c) => (
              <li key={c.id}>
                <Link href={`/app/customers/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {c.name}
                      {c.shopName ? ` · ${c.shopName}` : ""}
                    </span>
                    <span className="block truncate text-xs text-stone-500">{[c.mobile, c.city].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-stone-500">
                    {c.isBlocked ? <Badge tone="red">Blocked</Badge> : `${c.orderCount} order${c.orderCount === 1 ? "" : "s"}`}
                  </span>
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
