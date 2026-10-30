"use client";

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

/** "Placed on this phone" list for the My orders page. */
export function DeviceOrders({ slug }: { slug: string }) {
  const raw = useSyncExternalStore(
    noop,
    () => JSON.stringify(read(slug)),
    () => "[]",
  );
  const orders = JSON.parse(raw) as DeviceOrder[];
  if (!orders.length) return null;
  return (
    <section className="mb-6 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      <h2 className="mb-2 text-base font-semibold">Placed on this phone</h2>
      <ul className="divide-y divide-stone-100 text-sm">
        {orders.map((o) => (
          <li key={o.orderNo}>
            <Link href={o.url} className="flex items-center justify-between py-2.5 hover:underline">
              <span>PO No. {o.orderNo}</span>
              <span className="text-brand-700">View PO →</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
