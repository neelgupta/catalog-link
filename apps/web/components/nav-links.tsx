"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";

export type NavItem = { href: string; label: string; icon: IconName; exact?: boolean; badge?: number };

function useIsActive() {
  const pathname = usePathname();
  return (item: NavItem) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));
}

/** Phones and tablets: scrollable tabs under the header. */
export function NavLinks({ items }: { items: NavItem[] }) {
  const isActive = useIsActive();
  return (
    <nav className="overflow-x-auto px-2">
      <ul className="flex gap-1 whitespace-nowrap">
        {items.map((item) => {
          const active = isActive(item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`inline-block border-b-2 px-3 py-2.5 text-sm font-medium transition ${
                  active ? "border-brand-500 text-brand-700" : "border-transparent text-stone-500 hover:text-stone-800"
                }`}
              >
                {item.label}
                {!!item.badge && <Count n={item.badge} />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Count({ n }: { n: number }) {
  return (
    <span className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-brand-500 px-1.5 text-[11px] font-semibold text-white">
      {n > 99 ? "99+" : n}
    </span>
  );
}

/** Large screens: vertical navigation in the sidebar. */
export function SideNav({ items }: { items: NavItem[] }) {
  const isActive = useIsActive();
  return (
    <nav>
      <ul className="space-y-1">
        {items.map((item) => {
          const active = isActive(item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active ? "bg-brand-50 text-brand-700" : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                }`}
              >
                <Icon name={item.icon} className={`size-5 shrink-0 ${active ? "text-brand-600" : "text-stone-400"}`} />
                <span className="flex-1">{item.label}</span>
                {!!item.badge && <Count n={item.badge} />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
