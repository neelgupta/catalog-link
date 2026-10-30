import { getEnv } from "@cataloglink/core/env";
import { CUSTOMER_STATUS, listCustomerOrders } from "@cataloglink/core/orders";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCustomerSession } from "@/lib/auth";
import { getCatalogContext } from "@/lib/catalog";
import { formatDateTime } from "@/lib/format";
import { publicBaseUrl } from "@/lib/public-url";
import { CatalogHeader } from "../_components/catalog-header";
import { rupees } from "../_components/price";
import { DeviceOrders } from "../_components/device-orders";
import { LoginGate, LogoutButton } from "./login-gate";
import { StatusBadge } from "./status-badge";

export const metadata: Metadata = { title: "My orders", robots: { index: false } };

export default async function MyOrdersPage({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await getCatalogContext((await params).slug);
  if (!ctx) notFound();
  const session = await getCustomerSession(ctx.client.id);
  const orders = session ? await listCustomerOrders(ctx.client.id, session.mobile) : [];
  const base = `/c/${ctx.link.slug}`;

  return (
    <div className="min-h-dvh bg-stone-50">
      <CatalogHeader ctx={ctx} url={`${await publicBaseUrl()}${base}`} compact />
      <main className="mx-auto max-w-3xl px-4 py-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-xl font-semibold">My orders</h1>
          {session && (
            <span className="flex items-center gap-3 text-sm text-stone-500">
              {session.mobile} <LogoutButton slug={ctx.link.slug} />
            </span>
          )}
        </div>
        <DeviceOrders slug={ctx.link.slug} />
        {!session ? (
          <LoginGate slug={ctx.link.slug} devHint={getEnv().OTP_PROVIDER === "console"} />
        ) : orders.length === 0 ? (
          <div className="rounded-xl bg-white px-4 py-10 text-center text-sm text-stone-600 ring-1 ring-stone-200">
            No orders yet.{" "}
            <Link href={base} className="text-brand-700 underline">
              Browse the catalog
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`${base}/orders/${o.orderNo}`} className="block rounded-2xl bg-white p-4 ring-1 ring-stone-200 hover:ring-stone-300">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">Order #{o.orderNo}</p>
                      <p className="text-xs text-stone-500">{formatDateTime(o.createdAt)}</p>
                    </div>
                    <StatusBadge status={o.status} label={CUSTOMER_STATUS[o.status]} />
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    {o.items.map((i, n) =>
                      i.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- thumbnail
                        <img key={n} src={i.imageUrl} alt="" className="size-12 rounded-lg bg-stone-100 object-cover" />
                      ) : null,
                    )}
                    <p className="min-w-0 flex-1 truncate text-sm text-stone-600">
                      {o.items.map((i) => i.name).join(", ")}
                      {o._count.items > o.items.length ? ` +${o._count.items - o.items.length} more` : ""}
                    </p>
                    {(o.link?.showPrice ?? true) && <span className="shrink-0 text-sm font-semibold">{rupees(Number(o.grandTotal))}</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
