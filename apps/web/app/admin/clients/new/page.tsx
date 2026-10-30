import { prisma } from "@cataloglink/db";
import type { Metadata } from "next";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createClientAction } from "../actions";
import { ClientForm } from "../client-form";

export const metadata: Metadata = { title: "Add client" };

export default async function NewClientPage() {
  await requireSuperAdmin();
  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { price: "asc" },
    select: { id: true, name: true, durationDays: true },
  });

  return (
    <>
      <PageHeader title="Add client" back={{ href: "/admin/clients", label: "Clients" }} />
      {plans.length === 0 ? (
        <EmptyState>
          Create an active plan first.
          <span className="mt-3 block">
            <LinkButton href="/admin/plans">Go to plans</LinkButton>
          </span>
        </EmptyState>
      ) : (
        <ClientForm action={createClientAction} plans={plans} />
      )}
    </>
  );
}
