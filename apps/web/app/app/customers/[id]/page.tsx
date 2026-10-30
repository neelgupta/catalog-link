import { getCustomer } from "@cataloglink/core/customers";
import { forClient } from "@cataloglink/db";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, EmptyState, FormSuccess, PageHeader } from "@/components/ui";
import { requireClient } from "@/lib/auth";
import { formatDateTime, formatRupees } from "@/lib/format";
import { OrderStatusBadge } from "../../orders/status-badge";
import { updateCustomerAction } from "../actions";
import { BlockButton } from "../block-button";
import { CustomerForm } from "../customer-form";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { clientId } = await requireClient();
  const { id } = await params;
  const [customer, links] = await Promise.all([
    getCustomer(clientId, id),
    forClient(clientId).catalogLink.findMany({ orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }], select: { id: true, name: true, slug: true, isActive: true } }),
  ]);
  if (!customer) notFound();
  const { created } = await searchParams;
  const active = customer.orders.filter((o) => o.status !== "REJECTED" && o.status !== "CANCELLED");
  const spent = active.reduce((s, o) => s + Number(o.grandTotal), 0);

  return (
    <>
      <PageHeader
        back={{ href: "/app/customers", label: "Customers" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {customer.name}
            {customer.isBlocked && <Badge tone="red">Blocked</Badge>}
          </span>
        }
        subtitle={`${customer.shopName ? `${customer.shopName} · ` : ""}${customer.mobile} · ${customer.source === "MANUAL" ? "added by you" : "from an order"}`}
      />
      {created && (
        <div className="mb-4">
          <FormSuccess message="Customer added." />
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <p className="text-xs font-medium tracking-wide text-stone-500 uppercase">Orders</p>
          <p className="mt-1 text-2xl font-semibold">{customer.orders.length}</p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <p className="text-xs font-medium tracking-wide text-stone-500 uppercase">Total ordered</p>
          <p className="mt-1 text-2xl font-semibold">{formatRupees(spent)}</p>
        </div>
      </div>

      <Card title="Order history" className="mb-6">
        {customer.orders.length === 0 ? (
          <EmptyState>No orders yet.</EmptyState>
        ) : (
          <ul className="divide-y divide-stone-100">
            {customer.orders.map((o) => (
              <li key={o.id}>
                <Link href={`/app/orders/${o.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:bg-stone-50">
                  <span>
                    <span className="font-medium">#{o.orderNo}</span>
                    <span className="text-stone-500">
                      {" "}
                      · {formatDateTime(o.createdAt)} · {o._count.items} item{o._count.items === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="tabular-nums">{formatRupees(o.grandTotal)}</span>
                    <OrderStatusBadge status={o.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <CustomerForm
        action={updateCustomerAction.bind(null, customer.id)}
        links={links}
        mobileLocked={customer.orders.length > 0}
        customer={{
          name: customer.name,
          shopName: customer.shopName,
          mobile: customer.mobile,
          city: customer.city,
          address: customer.address,
          gst: customer.gst,
          linkIds: customer.links.map((l) => l.linkId),
        }}
      />

      <Card title={customer.isBlocked ? "Blocked" : "Block customer"} className="mt-10">
        <p className="mb-3 text-sm text-stone-600">
          {customer.isBlocked
            ? "This customer can browse your catalog but can't place orders."
            : "Blocked customers can still browse your catalog but can't place orders. Orders already placed are not affected."}
        </p>
        <BlockButton customerId={customer.id} blocked={customer.isBlocked} />
      </Card>
    </>
  );
}
