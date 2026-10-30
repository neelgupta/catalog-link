import { linkUsage } from "@cataloglink/core/links";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { requireClient } from "@/lib/auth";
import { createLinkAction } from "../actions";
import { linkFormData } from "../form-data";
import { LinkForm } from "../link-form";

export const metadata: Metadata = { title: "New link" };

export default async function NewLinkPage() {
  const { clientId } = await requireClient();
  const usage = await linkUsage(clientId);
  if (usage.used >= usage.limit) redirect("/app/links");
  const data = await linkFormData(clientId);

  return (
    <>
      <PageHeader
        back={{ href: "/app/links", label: "Links" }}
        title="New link"
        subtitle="Make a link for a customer or group with only the products you choose."
      />
      <LinkForm action={createLinkAction} {...data} />
    </>
  );
}
