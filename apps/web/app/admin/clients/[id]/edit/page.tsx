import { prisma } from "@cataloglink/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { updateClientAction } from "../../actions";
import { ClientForm } from "../../client-form";

export const metadata: Metadata = { title: "Edit client" };

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin();
  const { id } = await params;
  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) notFound();

  return (
    <>
      <PageHeader title={`Edit ${client.businessName}`} back={{ href: `/admin/clients/${id}`, label: client.businessName }} />
      <ClientForm action={updateClientAction.bind(null, id)} client={client} />
    </>
  );
}
