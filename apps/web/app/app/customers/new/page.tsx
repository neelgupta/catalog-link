import { forClient } from "@cataloglink/db";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireClient } from "@/lib/auth";
import { createCustomerAction } from "../actions";
import { CustomerForm } from "../customer-form";

export const metadata: Metadata = { title: "Add customer" };

export default async function NewCustomerPage() {
  const { clientId } = await requireClient();
  const links = await forClient(clientId).catalogLink.findMany({
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: { id: true, name: true, slug: true, isActive: true },
  });
  return (
    <>
      <PageHeader back={{ href: "/app/customers", label: "Customers" }} title="Add customer" />
      <CustomerForm action={createCustomerAction} links={links} />
    </>
  );
}
