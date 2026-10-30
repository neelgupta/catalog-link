import { AppShell } from "@/components/app-shell";
import type { NavItem } from "@/components/nav-links";
import { requireSuperAdmin } from "@/lib/auth";

const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: "dashboard", exact: true },
  { href: "/admin/clients", label: "Clients", icon: "clients" },
  { href: "/admin/plans", label: "Plans", icon: "plans" },
  { href: "/admin/settings", label: "Settings", icon: "settings" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdmin();
  return (
    <AppShell title="Super Admin" subtitle="Platform management" nav={NAV}>
      {children}
    </AppShell>
  );
}
