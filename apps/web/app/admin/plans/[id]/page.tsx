import { prisma } from "@cataloglink/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { deletePlanAction, updatePlanAction } from "../actions";
import { PlanForm } from "../plan-form";
import { DeletePlanForm } from "./delete-plan-form";

export const metadata: Metadata = { title: "Edit plan" };

export default async function EditPlanPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin();
  const { id } = await params;
  const plan = await prisma.plan.findUnique({ where: { id } });
  if (!plan) notFound();
  const assigned = await prisma.subscription.count({ where: { planId: id } });

  return (
    <>
      <PageHeader title={`Edit ${plan.name}`} back={{ href: "/admin/plans", label: "Plans" }}
        subtitle="Changes to limits apply to every client on this plan." />
      <div className="space-y-4">
        <Card>
          <PlanForm action={updatePlanAction.bind(null, id)} plan={{ ...plan, price: plan.price.toString() }} submitLabel="Save plan" />
        </Card>
        <Card title="Delete plan">
          {assigned > 0 ? (
            <p className="text-sm text-stone-600">
              This plan has been assigned {assigned} time(s), so it is kept for history. Untick &quot;Active&quot; above to stop offering it.
            </p>
          ) : (
            <DeletePlanForm action={deletePlanAction.bind(null, id)} />
          )}
        </Card>
      </div>
    </>
  );
}
