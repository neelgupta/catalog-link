import { daysLeft, isClientAvailable } from "@cataloglink/core/subscriptions";
import { prisma } from "@cataloglink/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, Detail, EmptyState, FormSuccess, PageHeader } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { dateInputValue, formatDate, formatDateTime, formatRupees } from "@/lib/format";
import {
  assignPlanAction,
  deleteClientAction,
  impersonateClientAction,
  recordPaymentAction,
  resetPasswordAction,
  setClientStatusAction,
} from "../actions";
import { EditClientDialog } from "../client-dialogs";
import { AssignPlanForm, DeleteClientForm, PaymentForm, ResetPasswordForm } from "./forms";
import { publicBaseUrl } from "@/lib/public-url";

export const metadata: Metadata = { title: "Client" };

const NOTICES: Record<string, string> = {
  created: "Client created with its default catalog link. Share the login details with the client.",
  updated: "Client details saved.",
  "logo-failed": "Client created, but the logo couldn't be saved. Edit the client to upload it again.",
};

const SUB_TONE = { TRIAL: "blue", ACTIVE: "green", EXPIRED: "red", CANCELLED: "stone" } as const;
const SYNC_TONE = { QUEUED: "stone", RUNNING: "blue", SUCCESS: "green", PARTIAL: "amber", FAILED: "red" } as const;

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; edit?: string }>;
}) {
  await requireSuperAdmin();
  const { id } = await params;
  const { notice, edit } = await searchParams;

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      users: { where: { role: "CLIENT_OWNER" }, select: { email: true, mobile: true, lastLoginAt: true, isActive: true } },
      subscriptions: { orderBy: { createdAt: "desc" }, include: { plan: true, payments: { orderBy: { paidAt: "desc" } } } },
      links: { where: { isDefault: true }, select: { slug: true } },
      sheetConnection: true,
      syncRuns: {
        orderBy: { startedAt: "desc" },
        take: 5,
        include: { rowErrors: { orderBy: { rowNumber: "asc" }, take: 20 } },
      },
      _count: { select: { links: true, products: true, customers: true, orders: true } },
    },
  });
  if (!client) notFound();

  const [plans, now] = [
    await prisma.plan.findMany({ where: { isActive: true }, orderBy: { price: "asc" }, select: { id: true, name: true, durationDays: true } }),
    new Date(),
  ];
  const owner = client.users[0];
  const current = client.subscriptions.find((s) => s.status === "TRIAL" || s.status === "ACTIVE") ?? null;
  const available = isClientAvailable(client, current, now);
  const catalogUrl = `${await publicBaseUrl()}/c/${client.links[0]?.slug ?? client.slug}`;
  const today = dateInputValue(now);
  const payments = client.subscriptions.flatMap((s) => s.payments.map((p) => ({ ...p, planName: s.plan.name })));

  return (
    <>
      <PageHeader
        back={{ href: "/admin/clients", label: "Clients" }}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={client.businessName} logoUrl={client.logoUrl} />
            <span className="min-w-0">
              {client.businessName}
              <span className="mt-1 flex flex-wrap gap-1.5">
                {client.status === "INACTIVE" ? <Badge>Inactive</Badge> : <Badge tone="green">Active</Badge>}
                {!available && client.status === "ACTIVE" && <Badge tone="red">Catalog unavailable: plan expired</Badge>}
              </span>
            </span>
          </span>
        }
        action={
          <div className="flex flex-wrap gap-2">
            <EditClientDialog
              clientId={id}
              initiallyOpen={edit === "1"}
              client={{
                businessName: client.businessName,
                ownerName: client.ownerName,
                mobile: client.mobile,
                email: client.email,
                gst: client.gst,
                city: client.city,
                address: client.address,
                logoUrl: client.logoUrl,
              }}
            />
            {owner && (
              <form action={impersonateClientAction.bind(null, id)}>
                <SubmitButton variant="secondary" pendingText="Opening…">Login as client</SubmitButton>
              </form>
            )}
          </div>
        }
      />

      {notice && NOTICES[notice] && (
        <div className="mb-4">
          <FormSuccess message={NOTICES[notice]} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Business">
          <dl className="divide-y divide-stone-100">
            <Detail label="Owner">{client.ownerName}</Detail>
            <Detail label="Mobile">{client.mobile}</Detail>
            <Detail label="Email">{client.email}</Detail>
            <Detail label="GST">{client.gst}</Detail>
            <Detail label="City">{client.city}</Detail>
            <Detail label="Address">{client.address}</Detail>
            <Detail label="Catalog link">
              <a href={catalogUrl} target="_blank" rel="noreferrer" className="text-brand-600 underline">{catalogUrl}</a>
            </Detail>
            <Detail label="Added">{formatDate(client.createdAt)}</Detail>
          </dl>
        </Card>

        <Card title="Owner login">
          {owner ? (
            <>
              <dl className="mb-4 divide-y divide-stone-100">
                <Detail label="Email">{owner.email}</Detail>
                <Detail label="Mobile (OTP)">{owner.mobile}</Detail>
                <Detail label="Last login">{owner.lastLoginAt ? formatDateTime(owner.lastLoginAt) : "Never"}</Detail>
              </dl>
              <ResetPasswordForm action={resetPasswordAction.bind(null, id)} />
            </>
          ) : (
            <EmptyState>No owner login.</EmptyState>
          )}
        </Card>

        <Card title="Plan">
          {current ? (
            <dl className="mb-4 divide-y divide-stone-100">
              <Detail label="Plan">
                {current.plan.name} <Badge tone={SUB_TONE[current.status]}>{current.status === "TRIAL" ? "Trial" : "Paid"}</Badge>
              </Detail>
              <Detail label="Period">{formatDate(current.startAt)} – {formatDate(current.expiresAt)}</Detail>
              <Detail label="Days left">
                {(() => {
                  const left = daysLeft(current.expiresAt, now);
                  return left < 0 ? <Badge tone="red">Expired</Badge> : `${left}`;
                })()}
              </Detail>
              <Detail label="Limits">
                {current.plan.maxProducts} products · {current.plan.maxCustomLinks} custom links · {current.plan.maxOrdersPerMonth} orders/month
              </Detail>
            </dl>
          ) : (
            <div className="mb-4"><EmptyState>No current plan. The catalog link is unavailable until a plan is assigned.</EmptyState></div>
          )}
          <details className="group rounded-xl border border-stone-200 p-3">
            <summary className="cursor-pointer text-sm font-medium">Assign / renew plan</summary>
            <div className="mt-3">
              {plans.length ? <AssignPlanForm action={assignPlanAction.bind(null, id)} plans={plans} today={today} /> : <EmptyState>No active plans.</EmptyState>}
            </div>
          </details>
        </Card>

        <Card title="Payments">
          {current && (
            <details className="mb-4 rounded-xl border border-stone-200 p-3">
              <summary className="cursor-pointer text-sm font-medium">Record a payment for {current.plan.name}</summary>
              <div className="mt-3"><PaymentForm action={recordPaymentAction.bind(null, id, current.id)} today={today} /></div>
            </details>
          )}
          {payments.length === 0 ? (
            <EmptyState>No payments recorded.</EmptyState>
          ) : (
            <ul className="divide-y divide-stone-100 text-sm">
              {payments.map((p) => (
                <li key={p.id} className="flex justify-between gap-3 py-2">
                  <span>
                    {formatDate(p.paidAt)} · {p.planName}
                    {p.reference && <span className="text-stone-500"> · {p.reference}</span>}
                    {p.note && <span className="block text-xs text-stone-500">{p.note}</span>}
                  </span>
                  <span className="font-medium tabular-nums">{formatRupees(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Catalog & usage">
          <dl className="divide-y divide-stone-100">
            <Detail label="Links">{client._count.links}</Detail>
            <Detail label="Products">{client._count.products}</Detail>
            <Detail label="Customers">{client._count.customers}</Detail>
            <Detail label="Orders">{client._count.orders}</Detail>
          </dl>
        </Card>

        <Card title="Sheet sync">
          {client.sheetConnection ? (
            <dl className="mb-3 divide-y divide-stone-100">
              <Detail label="Connected via">{client.sheetConnection.mode === "OAUTH" ? "Google account" : "Service account"}</Detail>
              <Detail label="Last sync">{formatDateTime(client.sheetConnection.lastSyncedAt)}</Detail>
            </dl>
          ) : (
            <div className="mb-3"><EmptyState>Google Sheet not connected yet.</EmptyState></div>
          )}
          {client.syncRuns.length > 0 && (
            <ul className="space-y-2 text-sm">
              {client.syncRuns.map((run) => (
                <li key={run.id} className="rounded-lg border border-stone-200 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span>{formatDateTime(run.startedAt)}</span>
                    <Badge tone={SYNC_TONE[run.status]}>{run.status.toLowerCase()}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-stone-500">
                    {run.rowsAdded} added · {run.rowsUpdated} updated · {run.rowsSkipped} skipped · {run.rowsRemoved} removed
                  </p>
                  {run.errorMessage && <p className="mt-1 text-xs text-red-600">{run.errorMessage}</p>}
                  {run.rowErrors.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs text-stone-600">
                      {run.rowErrors.map((e) => (
                        <li key={e.id}>Row {e.rowNumber}{e.sku ? ` (${e.sku})` : ""}: {e.message}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Status" className="lg:col-span-2">
          <div className="flex flex-col gap-6 sm:flex-row">
            <form action={setClientStatusAction.bind(null, id)} className="space-y-2 sm:w-1/2">
              <input type="hidden" name="status" value={client.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"} />
              <p className="text-sm text-stone-600">
                {client.status === "ACTIVE"
                  ? "Deactivating hides all of this client's catalog links (customers see \"Catalog not available\"). The client can still log in."
                  : "Activating makes the catalog links available again (if the plan hasn't expired)."}
              </p>
              <SubmitButton variant="secondary" confirm={client.status === "ACTIVE" ? "Deactivate this client? Their catalog links stop working." : undefined}>
                {client.status === "ACTIVE" ? "Deactivate client" : "Activate client"}
              </SubmitButton>
            </form>
            <div className="sm:w-1/2">
              <DeleteClientForm action={deleteClientAction.bind(null, id)} businessName={client.businessName} />
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
