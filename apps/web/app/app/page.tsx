import { VISIBLE_PRODUCT } from "@cataloglink/core/links";
import { prisma } from "@cataloglink/db";
import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Card, PageHeader, Stat } from "@/components/ui";
import { requireClient } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { CopyText } from "./sheet/connect-forms";
import { publicBaseUrl } from "@/lib/public-url";

export const metadata: Metadata = { title: "Dashboard" };

export default async function ClientHome() {
  const { clientId } = await requireClient();
  const [conn, okRun, link, products, outOfStock, client, customLinks, newOrders] = await Promise.all([
    prisma.sheetConnection.findUnique({ where: { clientId } }),
    prisma.syncRun.findFirst({
      where: { clientId, status: { in: ["SUCCESS", "PARTIAL"] } },
      select: { id: true },
    }),
    prisma.catalogLink.findFirst({ where: { clientId, isDefault: true }, select: { slug: true } }),
    prisma.product.count({ where: { clientId, ...VISIBLE_PRODUCT } }),
    prisma.product.count({ where: { clientId, ...VISIBLE_PRODUCT, availableQty: { lte: 0 } } }),
    prisma.client.findUniqueOrThrow({
      where: { id: clientId },
      select: {
        ownerName: true,
        logoUrl: true,
        upiId: true,
        upiQrUrl: true,
        bankDetails: true,
        paymentModes: true,
      },
    }),
    prisma.catalogLink.count({ where: { clientId, isDefault: false } }),
    prisma.order.count({ where: { clientId, status: "PLACED" } }),
  ]);
  const profileDone =
    !!client.logoUrl &&
    (client.paymentModes.some((m) => m !== "PAY_LATER") ||
      !!(client.upiId || client.upiQrUrl || client.bankDetails));
  const connected = !!conn?.spreadsheetId;
  const linkUrl = link ? `${await publicBaseUrl()}/c/${link.slug}` : null;

  const steps = [
    {
      done: connected || products > 0,
      title: "Download the sheet template",
      body: (
        <a className="text-brand-600 underline" href="/api/v1/sheet-template">
          Download template (.xlsx)
        </a>
      ),
    },
    {
      done: connected,
      title: "Connect your Google Sheet",
      body: (
        <Link className="text-brand-600 underline" href="/app/sheet">
          {connected ? "Manage connection" : "Connect now"}
        </Link>
      ),
    },
    {
      done: !!okRun,
      title: "Sync your products",
      body: (
        <Link className="text-brand-600 underline" href="/app/sheet">
          {okRun ? "View sync status" : "Open Google Sheet page and press Sync now"}
        </Link>
      ),
    },
    {
      done: profileDone,
      title: "Add your logo and payment details",
      body: (
        <Link className="text-brand-600 underline" href="/app/profile">
          {profileDone ? "Edit profile" : "Open profile"}
        </Link>
      ),
    },
    {
      done: products > 0,
      title: "Share your catalog link",
      body: linkUrl ? (
        <div className="space-y-2">
          <CopyText text={linkUrl} />
          <Link className="text-brand-600 underline" href="/app/links">
            WhatsApp, QR code and custom links
          </Link>
        </div>
      ) : null,
    },
  ];
  const allDone = steps.every((s) => s.done);

  const actions = [
    {
      href: "/app/products",
      icon: "products",
      title: "Products",
      body: "Search, preview and hide products",
    },
    {
      href: "/app/links",
      icon: "links",
      title: "Catalog links",
      body: "Share on WhatsApp, QR codes, custom links",
    },
    { href: "/app/sheet", icon: "sheet", title: "Google Sheet", body: "Sync status and errors" },
    {
      href: "/app/profile",
      icon: "profile",
      title: "Business profile",
      body: "Logo, banner and payment details",
    },
  ] as const;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${client.ownerName}`}
        subtitle="Here's how your catalog is doing."
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:gap-4 xl:grid-cols-5">
        <Stat label="New orders" value={newOrders} hint={newOrders ? "Waiting for you to confirm" : undefined} />
        <Stat label="Products on link" value={products} />
        <Stat label="Out of stock" value={outOfStock} />
        <Stat label="Custom links" value={customLinks} />
        <Stat
          label="Last sync"
          value={
            <span className="text-base">
              {conn?.lastSyncedAt ? formatDateTime(conn.lastSyncedAt) : "—"}
            </span>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title={allDone ? "Your catalog is live" : "Get your catalog live"}
        >
          <ol className="space-y-4">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                    s.done ? "bg-green-100 text-green-800" : "bg-stone-100 text-stone-600"
                  }`}
                  aria-label={s.done ? "Done" : `Step ${i + 1}`}
                >
                  {s.done ? "✓" : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{s.title}</p>
                  {s.body && <div className="mt-1 text-sm">{s.body}</div>}
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <Card title="Quick actions">
          <ul className="-mx-2 space-y-1">
            {actions.map((a) => (
              <li key={a.href}>
                <Link
                  href={a.href}
                  className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-stone-50"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <Icon name={a.icon} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{a.title}</span>
                    <span className="block truncate text-xs text-stone-500">{a.body}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
