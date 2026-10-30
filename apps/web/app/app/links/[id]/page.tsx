import { selectionValuesOf } from "@cataloglink/core/links";
import { forClient } from "@cataloglink/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { parseLinkPricing } from "@cataloglink/core/link-pricing";
import { FormSection, PageHeader } from "@/components/ui";
import { requireClient } from "@/lib/auth";
import { updateLinkAction } from "../actions";
import { linkFormData } from "../form-data";
import { LinkForm } from "../link-form";
import { DeleteLinkButton } from "./delete-link-button";

export const metadata: Metadata = { title: "Edit link" };

export default async function EditLinkPage({ params }: { params: Promise<{ id: string }> }) {
  const { clientId } = await requireClient();
  const { id } = await params;
  const link = await forClient(clientId).catalogLink.findFirst({ where: { id } });
  if (!link) notFound();
  const data = await linkFormData(clientId);

  return (
    <>
      <PageHeader back={{ href: "/app/links", label: "Links" }} title={link.name} subtitle={link.isDefault ? "Default link" : "Custom link"} />
      <LinkForm
        action={updateLinkAction.bind(null, link.id)}
        link={{
          name: link.name,
          slug: link.slug,
          isDefault: link.isDefault,
          selectionType: link.selectionType,
          selectionValues: selectionValuesOf(link),
          showPrice: link.showPrice,
          allowOrdering: link.allowOrdering,
          isActive: link.isActive,
          pricing: parseLinkPricing(link.pricing),
        }}
        {...data}
      />
      {!link.isDefault && (
        <FormSection
          className="mt-8"
          title="Delete link"
          description="Customers with this link will see “Catalog not available”. Orders already placed through it are kept."
        >
          <DeleteLinkButton linkId={link.id} />
        </FormSection>
      )}
    </>
  );
}
