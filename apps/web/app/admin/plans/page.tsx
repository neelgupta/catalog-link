import { listPlans } from "@cataloglink/core/plans";
import type { Metadata } from "next";
import { prisma } from "@cataloglink/db";
import { Badge, EmptyState, FormSuccess, PageHeader } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { formatRupees } from "@/lib/format";
import { EditPlanDialog } from "./edit-plan-dialog";
import { NewPlanDialog } from "./new-plan-dialog";

export const metadata: Metadata = { title: "Plans" };

export default async function PlansPage({ searchParams }: { searchParams: Promise<{ edit?: string; notice?: string }> }) {
  await requireSuperAdmin();
  const { edit, notice } = await searchParams;
  const [plans, everAssigned] = await Promise.all([
    listPlans(),
    prisma.subscription.groupBy({ by: ["planId"], _count: { _all: true } }),
  ]);
  const assigned = new Map(everAssigned.map((g) => [g.planId, g._count._all]));

  return (
    <>
      <PageHeader
        title="Plans"
        subtitle="Limits apply per client. Payments are recorded manually for now."
        action={<NewPlanDialog />}
      />
      {notice === "deleted" && (
        <div className="mb-4">
          <FormSuccess message="Plan deleted." />
        </div>
      )}

      {plans.length === 0 ? (
        <EmptyState>No plans yet. Tap &quot;Add plan&quot; to create one.</EmptyState>
      ) : (
        <ul className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => (
            <li key={p.id}>
              <EditPlanDialog
                plan={{ ...p, price: p.price.toString() }}
                assigned={assigned.get(p.id) ?? 0}
                initiallyOpen={edit === p.id}
              >
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
              </EditPlanDialog>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
