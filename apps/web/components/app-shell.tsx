import { logout } from "@/app/(auth)/login/actions";
import { Icon } from "./icons";
import { NavLinks, SideNav, type NavItem } from "./nav-links";

function BrandMark({ className = "size-8" }: { className?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white ${className}`}>
      <Icon name="links" className="size-[60%]" />
    </span>
  );
}

/**
 * Page frame for the Super Admin and client panels: a sidebar on large screens, a top bar with
 * scrollable tabs on phones and tablets.
 */
export function AppShell({
  title,
  subtitle,
  nav,
  banner,
  children,
}: {
  title: string;
  subtitle?: string;
  nav: NavItem[];
  banner?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-stone-200 bg-white lg:flex">
        <div className="flex h-16 items-center gap-2.5 border-b border-stone-100 px-5">
          <BrandMark />
          <span className="text-base font-semibold tracking-tight">CatalogLink</span>
        </div>
        <div className="px-4 pt-5 pb-3">
          <div className="rounded-xl bg-stone-50 px-3 py-2.5">
            <p className="truncate text-sm font-semibold" title={title}>
              {title}
            </p>
            {subtitle && <p className="truncate text-xs text-stone-500">{subtitle}</p>}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-2">
          <SideNav items={nav} />
        </div>
        <form action={logout} className="border-t border-stone-100 p-4">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-stone-600 transition hover:bg-stone-100 hover:text-stone-900"
          >
            <Icon name="logout" className="size-5 text-stone-400" />
            Log out
          </button>
        </form>
      </aside>

      <div className="lg:pl-64">
        {banner}
        <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/95 backdrop-blur lg:hidden">
          <div className="flex h-14 items-center justify-between gap-3 px-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <BrandMark className="size-7" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{title}</p>
                {subtitle && <p className="truncate text-xs text-stone-500">{subtitle}</p>}
              </div>
            </div>
            <form action={logout}>
              <button type="submit" className="rounded-lg px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100">
                Log out
              </button>
            </form>
          </div>
          <NavLinks items={nav} />
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</main>
      </div>
    </div>
  );
}

export function Placeholder({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-dashed border-stone-300 bg-white p-6">
      <h1 className="text-lg font-semibold">{heading}</h1>
      <div className="mt-2 text-sm text-stone-600">{children}</div>
    </section>
  );
}
