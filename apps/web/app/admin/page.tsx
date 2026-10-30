import { getAdminDashboard } from "@cataloglink/core/admin-stats";
import { daysLeft } from "@cataloglink/core/subscriptions";
import type { Metadata } from "next";
import Link from "next/link";
import { activePlans } from "@/lib/admin-data";
import { AddClientDialog } from "./clients/client-dialogs";
import { Badge, Card, EmptyState, PageHeader, Stat } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Super Admin" };

export default async function AdminDashboard() {
  await requireSuperAdmin();
  const d = await getAdminDashboard();

  return (
    <>
      <PageHeader title="Dashboard" action={<AddClientDialog plans={await activePlans()} />} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Clients" value={d.totalClients} href="/admin/clients" />
        <Stat label="Active clients" value={d.activeClients} href="/admin/clients?status=active" />
        <Stat label="Catalog links" value={d.links} />
        <Stat label="Orders today" value={d.ordersToday} />
        <Stat label="Orders this month" value={d.ordersMonth} />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card title="Plans expiring in 7 days">
          {d.expiring.length === 0 ? (
            <EmptyState>No plans expiring soon.</EmptyState>
          ) : (
            <ul className="divide-y divide-stone-100">
              {d.expiring.map((s) => {
                const left = daysLeft(s.expiresAt);
                return (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <Link href={`/admin/clients/${s.client.id}`} className="block truncate text-sm font-medium hover:underline">
                        {s.client.businessName}
                      </Link>
                      <p className="text-xs text-stone-500">
                        {s.plan.name}
                        {s.status === "TRIAL" ? " (trial)" : ""} · {formatDate(s.expiresAt)} · {s.client.mobile}
                      </p>
                    </div>
                    <Badge tone={left < 0 ? "red" : "amber"}>
                      {left < 0 ? "Expired" : left === 0 ? "Today" : `${left} day${left === 1 ? "" : "s"}`}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Sheet sync failures">
          {d.syncFailures.length === 0 ? (
            <EmptyState>No failed syncs.</EmptyState>
          ) : (
            <ul className="divide-y divide-stone-100">
              {d.syncFailures.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                  <Link href={`/admin/clients/${c.client.id}`} className="truncate text-sm font-medium hover:underline">
                    {c.client.businessName}
                  </Link>
                  <span className="text-xs text-stone-500">{formatDateTime(c.lastSyncedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
