import { listPlans } from "@cataloglink/core/plans";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { formatRupees } from "@/lib/format";
import { createPlanAction } from "./actions";
import { PlanForm } from "./plan-form";

export const metadata: Metadata = { title: "Plans" };

export default async function PlansPage() {
  await requireSuperAdmin();
  const plans = await listPlans();

  return (
    <>
      <PageHeader title="Plans" subtitle="Limits apply per client. Payments are recorded manually for now." />

      {plans.length === 0 ? (
        <EmptyState>No plans yet.</EmptyState>
      ) : (
        <ul className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => (
            <li key={p.id}>
              <Link href={`/admin/plans/${p.id}`} className="block rounded-2xl border border-stone-200 bg-white p-4 hover:border-stone-300">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{p.name}</p>
                  {p.isActive ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}
                </div>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {formatRupees(p.price)} <span className="text-sm font-normal text-stone-500">/ {p.durationDays} days</span>
                </p>
                <ul className="mt-2 space-y-0.5 text-sm text-stone-600">
                  <li>{p.maxProducts.toLocaleString("en-IN")} products</li>
                  <li>{p.maxCustomLinks} custom links</li>
                  <li>{p.maxOrdersPerMonth.toLocaleString("en-IN")} orders / month</li>
                  <li>{p.maxStaff} staff logins</li>
                </ul>
                <p className="mt-2 text-xs text-stone-500">{p._count.subscriptions} client(s) on this plan</p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Card title="New plan">
        <PlanForm action={createPlanAction} submitLabel="Create plan" />
      </Card>
    </>
  );
}
