import {
  countLinkProducts,
  linkShareText,
  linkUsage,
  selectionValuesOf,
  whatsappShareUrl,
} from "@cataloglink/core/links";
import { forClient, prisma } from "@cataloglink/db";
import type { Metadata } from "next";
import Link from "next/link";
import { discountLabel, parseLinkPricing } from "@cataloglink/core/link-pricing";
import { Badge, buttonClass, FormSuccess, LinkButton, PageHeader } from "@/components/ui";
import { requireClient } from "@/lib/auth";
import { ShareButtons } from "./share-buttons";
import { publicBaseUrl } from "@/lib/public-url";

export const metadata: Metadata = { title: "Links" };

function selectionSummary(link: { selectionType: string; selectionValues: unknown }) {
  const values = selectionValuesOf(link as Parameters<typeof selectionValuesOf>[0]);
  switch (link.selectionType) {
    case "CATEGORY":
      return `${values.length === 1 ? "Category" : "Categories"}: ${values.join(", ")}`;
    case "CATALOG":
      return `${values.length === 1 ? "Catalog" : "Catalogs"}: ${values.join(", ")}`;
    case "PRODUCTS":
      return `${values.length} hand-picked product${values.length === 1 ? "" : "s"}`;
    default:
      return "All products";
  }
}

export default async function LinksPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; deleted?: string }>;
}) {
  const { clientId } = await requireClient();
  const sp = await searchParams;
  const [client, links, usage] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { businessName: true } }),
    forClient(clientId).catalogLink.findMany({
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    }),
    linkUsage(clientId),
  ]);
  const counts = await Promise.all(links.map((l) => countLinkProducts(clientId, l)));
  const appUrl = await publicBaseUrl();
  const canCreate = usage.used < usage.limit;

  return (
    <>
      <PageHeader
        title="Catalog links"
        subtitle={`${usage.used} of ${usage.limit} custom link${usage.limit === 1 ? "" : "s"} used on your plan`}
        action={canCreate ? <LinkButton href="/app/links/new">New link</LinkButton> : undefined}
      />

      {sp.created && (
        <div className="mb-4">
          <FormSuccess message="Link created. Share it with your customers below." />
        </div>
      )}
      {sp.deleted && (
        <div className="mb-4">
          <FormSuccess message="Link deleted." />
        </div>
      )}
      {!canCreate && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {usage.limit === 0
            ? "Your plan doesn't include custom links."
            : "You've used all custom links on your plan. Delete one you no longer use, or ask CatalogLink support to upgrade."}
        </p>
      )}

      <ul className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {links.map((link, i) => {
          const url = `${appUrl}/c/${link.slug}`;
          return (
            <li
              key={link.id}
              className={`rounded-2xl border bg-white p-4 ${sp.created === link.id ? "border-brand-500 ring-2 ring-brand-100" : "border-stone-200"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">
                      <Link href={`/app/links/${link.id}`} className="hover:text-brand-700 hover:underline">
                        {link.name}
                      </Link>
                    </h2>
                    {link.isDefault && <Badge tone="blue">Default</Badge>}
                    {!link.isActive && <Badge tone="stone">Off</Badge>}
                    {!link.showPrice && <Badge tone="amber">Price hidden</Badge>}
                    {(() => {
                      const pricing = parseLinkPricing(link.pricing);
                      if (link.isDefault || pricing.mode === "NONE") return null;
                      return (
                        <Badge tone="green">
                          {pricing.mode === "ALL" ? discountLabel(pricing.discount) : pricing.mode === "GROUP" ? "Discount on some" : "Discounts"}
                        </Badge>
                      );
                    })()}
                    {!link.allowOrdering && <Badge tone="amber">Ordering off</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-stone-500">
                    {selectionSummary(link)} · {counts[i]} product{counts[i] === 1 ? "" : "s"} shown
                  </p>
                </div>
                <Link
                  href={`/app/links/${link.id}`}
                  className={buttonClass("ghost", "h-9 shrink-0 px-3")}
                >
                  Edit
                </Link>
              </div>
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="my-3 block truncate rounded-lg bg-stone-50 px-3 py-2 font-mono text-sm text-brand-700 hover:underline"
              >
                {url}
              </a>
              <ShareButtons
                linkId={link.id}
                url={url}
                whatsappUrl={whatsappShareUrl(
                  linkShareText(client.businessName, link.name, url, link.isDefault),
                )}
              />
            </li>
          );
        })}
      </ul>
    </>
  );
}
