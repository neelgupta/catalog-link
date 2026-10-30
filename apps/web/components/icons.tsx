import {
  Layers,
  LayoutDashboard,
  Link2,
  LogOut,
  type LucideProps,
  Package,
  ReceiptText,
  Sheet,
  SlidersHorizontal,
  Store,
  Users,
} from "lucide-react";

/** App icons by name (Lucide). Components elsewhere import Lucide icons directly. */
const ICONS = {
  dashboard: LayoutDashboard,
  clients: Users,
  plans: Layers,
  settings: SlidersHorizontal,
  products: Package,
  links: Link2,
  sheet: Sheet,
  profile: Store,
  orders: ReceiptText,
  logout: LogOut,
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className = "size-5", ...props }: { name: IconName } & LucideProps) {
  const Component = ICONS[name];
  return <Component aria-hidden="true" strokeWidth={1.75} className={className} {...props} />;
}
