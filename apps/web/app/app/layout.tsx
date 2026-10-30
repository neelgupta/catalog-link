import { prisma } from "@cataloglink/db";
import { AppShell } from "@/components/app-shell";
import type { NavItem } from "@/components/nav-links";
import { newOrderCount } from "@cataloglink/core/orders";
import { requireClient } from "@/lib/auth";
import { NewOrderWatcher } from "./new-order-watcher";
import { exitImpersonationAction } from "./actions";

const NAV: NavItem[] = [
  { href: "/app", label: "Dashboard", icon: "dashboard", exact: true },
  { href: "/app/orders", label: "Orders", icon: "orders" },
  { href: "/app/customers", label: "Customers", icon: "clients" },
  { href: "/app/products", label: "Products", icon: "products" },
  { href: "/app/links", label: "Links", icon: "links" },
  { href: "/app/sheet", label: "Google Sheet", icon: "sheet" },
  { href: "/app/profile", label: "Profile", icon: "profile" },
  { href: "/app/settings", label: "Settings", icon: "settings" },
];

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const { clientId, impersonatedBy } = await requireClient();
  const [client, newOrders] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId }, select: { businessName: true } }),
    newOrderCount(clientId),
  ]);
  const nav = NAV.map((item) => (item.href === "/app/orders" ? { ...item, badge: newOrders } : item));

  const banner = impersonatedBy ? (
    <div className="bg-amber-100 text-amber-900">
      <form action={exitImpersonationAction} className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 text-sm sm:px-6 lg:px-10">
        <span>
          Super Admin view: you are logged in as <strong>{client?.businessName}</strong>.
        </span>
        <button type="submit" className="shrink-0 rounded-full bg-amber-900 px-3 py-1 text-xs font-semibold text-white">
          Exit
        </button>
      </form>
    </div>
  ) : undefined;

  return (
    <AppShell title={client?.businessName ?? "Your business"} subtitle="Client dashboard" nav={nav} banner={banner}>
      <NewOrderWatcher initial={newOrders} />
      {children}
    </AppShell>
  );
}
