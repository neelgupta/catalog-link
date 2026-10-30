import { isClientAvailable } from "@cataloglink/core/subscriptions";
import { prisma, type Prisma } from "@cataloglink/db";
import type { Metadata } from "next";
import Link from "next/link";
import { LiveForm } from "@/components/live-form";
import { activePlans } from "@/lib/admin-data";
import { AddClientDialog } from "./client-dialogs";
import { Avatar } from "@/components/avatar";
import { Badge, buttonClass, EmptyState, PageHeader, SearchField } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Clients" };

const PAGE_SIZE = 25;
const STATUSES = {
  all: "All",
  active: "Active",
  inactive: "Inactive",
  expired: "Plan expired",
} as const;
type StatusFilter = keyof typeof STATUSES;

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string; add?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const status: StatusFilter =
    sp.status && sp.status in STATUSES ? (sp.status as StatusFilter) : "all";
  const page = Math.max(1, Number(sp.page) || 1);
  const now = new Date();

  const currentSub = { status: { in: ["TRIAL", "ACTIVE"] as ("TRIAL" | "ACTIVE")[] } };
  const contains = { contains: q, mode: "insensitive" as const };
  const where: Prisma.ClientWhereInput = {
    ...(q && {
      OR: [
        { businessName: contains },
        { ownerName: contains },
        { email: contains },
        { city: contains },
        { slug: contains },
        { mobile: { contains: q.replace(/\D/g, "") || q } },
      ],
    }),
    ...(status === "active" && { status: "ACTIVE" }),
    ...(status === "inactive" && { status: "INACTIVE" }),
    // Expired: no current subscription that runs past now.
    ...(status === "expired" && {
      subscriptions: { none: { ...currentSub, expiresAt: { gt: now } } },
    }),
  };

  const [total, clients] = await Promise.all([
    prisma.client.count({ where }),
    prisma.client.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        subscriptions: {
          where: currentSub,
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { plan: { select: { name: true } } },
        },
      },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (params: { status?: string; page?: number }) => {
    const s = new URLSearchParams();
    const nextStatus = "status" in params ? params.status : status === "all" ? undefined : status;
    if (q) s.set("q", q);
    if (nextStatus) s.set("status", nextStatus);
    if (params.page && params.page > 1) s.set("page", String(params.page));
    return `/admin/clients${s.size ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle={`${total} client${total === 1 ? "" : "s"}`}
        action={<AddClientDialog plans={await activePlans()} initiallyOpen={sp.add === "1"} />}
      />

      <LiveForm className="mb-3" action="/admin/clients">
        {status !== "all" && <input type="hidden" name="status" value={status} />}
        <SearchField defaultValue={q} placeholder="Search name, mobile, email, city…" aria-label="Search clients" />
      </LiveForm>

      <div className="mb-4 flex gap-2 overflow-x-auto">
        {(Object.keys(STATUSES) as StatusFilter[]).map((s) => (
          <Link
            key={s}
            href={href({ status: s === "all" ? undefined : s, page: undefined })}
            className={`rounded-full px-3 py-1 text-sm whitespace-nowrap ${
              s === status
                ? "bg-stone-900 text-white"
                : "bg-white text-stone-600 ring-1 ring-stone-200"
            }`}
          >
            {STATUSES[s]}
          </Link>
        ))}
      </div>

      {clients.length === 0 ? (
        <EmptyState>
          {q || status !== "all" ? "No clients match." : "No clients yet. Add your first client."}
        </EmptyState>
      ) : (
        <>
          <table className="hidden w-full overflow-hidden rounded-2xl border border-stone-200 bg-white text-sm lg:table">
            <thead className="bg-stone-50 text-left text-xs font-medium tracking-wide text-stone-500 uppercase">
              <tr>
                <th className="px-4 py-3">Business</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Mobile</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {clients.map((c) => {
                const sub = c.subscriptions[0] ?? null;
                const available = isClientAvailable(c, sub, now);
                return (
                  <tr key={c.id} className="relative hover:bg-stone-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/clients/${c.id}`}
                        className="flex items-center gap-3 font-medium after:absolute after:inset-0"
                      >
                        <Avatar name={c.businessName} logoUrl={c.logoUrl} size="size-9" />
                        {c.businessName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-stone-600">{c.ownerName}</td>
                    <td className="px-4 py-3 text-stone-600 tabular-nums">{c.mobile}</td>
                    <td className="px-4 py-3 text-stone-600">{c.city}</td>
                    <td className="px-4 py-3 text-stone-600">{sub?.plan.name ?? "No plan"}</td>
                    <td className="px-4 py-3 text-stone-600">
                      {sub ? formatDate(sub.expiresAt) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {c.status === "INACTIVE" ? (
                        <Badge tone="stone">Inactive</Badge>
                      ) : available ? (
                        <Badge tone={sub?.status === "TRIAL" ? "blue" : "green"}>
                          {sub?.status === "TRIAL" ? "Trial" : "Active"}
                        </Badge>
                      ) : (
                        <Badge tone="red">Plan expired</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white lg:hidden">
            {clients.map((c) => {
              const sub = c.subscriptions[0] ?? null;
              const available = isClientAvailable(c, sub, now);
              return (
                <li key={c.id}>
                  <Link
                    href={`/admin/clients/${c.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50"
                  >
                    <Avatar name={c.businessName} logoUrl={c.logoUrl} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{c.businessName}</p>
                      <p className="truncate text-xs text-stone-500">
                        {c.ownerName} · {c.mobile} · {c.city}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {c.status === "INACTIVE" ? (
                        <Badge tone="stone">Inactive</Badge>
                      ) : available ? (
                        <Badge tone={sub?.status === "TRIAL" ? "blue" : "green"}>
                          {sub?.status === "TRIAL" ? "Trial" : "Active"}
                        </Badge>
                      ) : (
                        <Badge tone="red">Plan expired</Badge>
                      )}
                      <span className="hidden text-xs text-stone-500 sm:block">
                        {sub ? `${sub.plan.name} · till ${formatDate(sub.expiresAt)}` : "No plan"}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link className={buttonClass("secondary")} href={href({ page: page - 1 })}>
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-stone-500">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link className={buttonClass("secondary")} href={href({ page: page + 1 })}>
              Next
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </>
  );
}
