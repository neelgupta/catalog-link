"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";

/** Orders placed on this phone/browser for one catalog link: their private PO links. */
type DeviceOrder = { orderNo: number; url: string };
const key = (slug: string) => `cl_orders_${slug}`;

function read(slug: string): DeviceOrder[] {
  try {
    const v = JSON.parse(localStorage.getItem(key(slug)) ?? "[]");
    return Array.isArray(v) ? v.filter((o) => Number.isInteger(o?.orderNo) && typeof o?.url === "string" && o.url.startsWith("/c/")) : [];
  } catch {
    return [];
  }
}

export function rememberOrder(slug: string, order: DeviceOrder) {
  try {
    const list = [order, ...read(slug).filter((o) => o.orderNo !== order.orderNo)].slice(0, 50);
    localStorage.setItem(key(slug), JSON.stringify(list));
  } catch {
    /* storage blocked: the PO link still works */
  }
}

const noop = () => () => {};

/** "Placed on this phone" list for the My orders page; with `showEmpty`, a friendly empty state. */
export function DeviceOrders({ slug, showEmpty = false }: { slug: string; showEmpty?: boolean }) {
  const raw = useSyncExternalStore(
    noop,
    () => JSON.stringify(read(slug)),
    () => "[]",
  );
  const orders = JSON.parse(raw) as DeviceOrder[];
  if (!orders.length) {
    if (!showEmpty) return null;
    return (
      <div className="mb-6 rounded-2xl bg-white px-4 py-10 text-center ring-1 ring-stone-200">
        <p className="text-sm text-stone-600">No orders from this phone yet.</p>
        <Link href={`/c/${slug}`} className="mt-4 inline-flex h-11 items-center rounded-full bg-brand-500 px-6 text-sm font-semibold text-white">
          Browse the catalog
        </Link>
      </div>
    );
  }
  return (
    <section className="mb-6 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      <h2 className="mb-2 text-base font-semibold">Placed on this phone</h2>
      <ul className="divide-y divide-stone-100 text-sm">
        {orders.map((o) => (
          <li key={o.orderNo}>
            <Link href={o.url} className="flex items-center justify-between py-3 hover:underline">
              <span>PO No. {o.orderNo}</span>
              <span className="inline-flex items-center gap-1 text-brand-700">View PO <ArrowRight aria-hidden="true" className="size-4" /></span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Home-page reminder, shown only when this phone has placed orders on this link. */
export function DeviceOrdersBanner({ slug }: { slug: string }) {
  const count = useSyncExternalStore(noop, () => read(slug).length, () => 0);
  if (!count) return null;
  return (
    <Link
      href={`/c/${slug}/orders`}
      className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-sm ring-1 ring-stone-200 hover:ring-stone-300"
    >
      <span>
        You have <span className="font-semibold">{count === 1 ? "1 order" : `${count} orders`}</span> from this phone
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 font-medium text-brand-700">View <ArrowRight aria-hidden="true" className="size-4" /></span>
    </Link>
  );
}
