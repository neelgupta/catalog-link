import { ArrowRight, ChevronLeft, Search } from "lucide-react";
import Link from "next/link";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const variants: Record<Variant, string> = {
  primary: "bg-brand-500 text-white hover:bg-brand-600",
  secondary: "border border-stone-300 bg-white text-stone-800 hover:bg-stone-50",
  danger: "bg-red-600 text-white hover:bg-red-700",
  ghost: "text-stone-600 hover:bg-stone-100",
};

export function buttonClass(variant: Variant = "primary", className = "") {
  return `inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`;
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function LinkButton({
  href,
  variant = "primary",
  className = "",
  children,
}: {
  href: string;
  variant?: Variant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, className)}>
      {children}
    </Link>
  );
}

const fieldClass =
  "w-full rounded-xl border bg-white px-3.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-stone-100 sm:text-sm";

function FieldShell({
  label,
  error,
  hint,
  children,
}: {
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-stone-700">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-stone-500">{hint}</span>
      ) : null}
    </label>
  );
}

export function Input({
  label,
  error,
  hint,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; error?: string; hint?: ReactNode }) {
  return (
    <FieldShell label={label} error={error} hint={hint}>
      <input
        aria-invalid={error ? true : undefined}
        className={`${fieldClass} h-11 ${error ? "border-red-400" : "border-stone-300"} ${className}`}
        {...props}
      />
    </FieldShell>
  );
}

export function Textarea({
  label,
  error,
  hint,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; hint?: ReactNode }) {
  return (
    <FieldShell label={label} error={error} hint={hint}>
      <textarea
        aria-invalid={error ? true : undefined}
        className={`${fieldClass} min-h-20 py-2 ${error ? "border-red-400" : "border-stone-300"}`}
        {...props}
      />
    </FieldShell>
  );
}

export function Select({
  label,
  error,
  hint,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string; hint?: ReactNode }) {
  return (
    <FieldShell label={label} error={error} hint={hint}>
      <select
        aria-invalid={error ? true : undefined}
        className={`${fieldClass} h-11 ${error ? "border-red-400" : "border-stone-300"}`}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  );
}

export function Checkbox({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-sm text-stone-700">
      <input type="checkbox" className="size-5 shrink-0 rounded border-stone-300 accent-brand-500" {...props} />
      {label}
    </label>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </p>
  );
}

export function FormSuccess({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="status" className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">
      {message}
    </p>
  );
}

const badgeTones = {
  green: "bg-green-100 text-green-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-700",
  stone: "bg-stone-100 text-stone-700",
  blue: "bg-blue-100 text-blue-800",
} as const;

export function Badge({ tone = "stone", children }: { tone?: keyof typeof badgeTones; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badgeTones[tone]}`}>
      {children}
    </span>
  );
}

export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-stone-200 bg-white p-4 sm:p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Search box with a magnifier icon. Put it inside a `LiveForm` to search while typing. */
export function SearchField({
  className = "",
  inputClassName = "",
  ...props
}: { className?: string; inputClassName?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={`relative min-w-0 ${className}`}>
      <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400" />
      <input
        name="q"
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        className={`h-10 w-full rounded-xl border border-stone-300 bg-white pr-3 pl-9 text-base outline-none focus:border-brand-500 sm:text-sm ${inputClassName}`}
        {...props}
      />
    </div>
  );
}

/** "← Products" style back button: a rounded chip with an arrow, easy to tap on phones. */
export function BackLink({ href, label, className = "" }: { href: string; label: string; className?: string }) {
  return (
    <Link
      href={href}
      className={`group inline-flex h-9 max-w-full items-center gap-1.5 rounded-full border border-stone-200 bg-white pr-3.5 pl-2.5 text-sm font-medium text-stone-700 shadow-xs transition hover:border-stone-300 hover:bg-stone-50 hover:text-stone-900 ${className}`}
    >
      <ChevronLeft aria-hidden="true" className="size-4 shrink-0 transition group-hover:-translate-x-0.5" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
  back,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-5">
      {back && (
        <BackLink href={back.href} label={back.label} className="mb-3" />
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-stone-500">{subtitle}</div>}
        </div>
        {action}
      </div>
    </div>
  );
}

/** A number card. With `href` the whole card is a link (with an arrow) to the page behind the number. */
export function Stat({
  label,
  value,
  hint,
  href,
  highlight = false,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  href?: string;
  highlight?: boolean;
}) {
  const body = (
    <>
      <p className="flex items-center justify-between gap-2 text-xs font-medium tracking-wide text-stone-500 uppercase">
        {label}
        {href && (
          <ArrowRight aria-hidden="true" className="size-4 text-stone-400 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
        )}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-stone-500">{hint}</p>}
    </>
  );
  const box = `rounded-2xl border bg-white p-4 ${highlight ? "border-brand-500 ring-2 ring-brand-100" : "border-stone-200"}`;
  return href ? (
    <Link href={href} className={`group block transition hover:border-brand-300 hover:shadow-sm ${box}`}>
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-stone-50 px-4 py-6 text-center text-sm text-stone-500">{children}</p>;
}

/** Definition list row for detail pages. */
export function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-2 text-sm">
      <dt className="text-stone-500">{label}</dt>
      <dd className="col-span-2 break-words">{children ?? <span className="text-stone-400">—</span>}</dd>
    </div>
  );
}

/**
 * A form section: on large screens the title and description sit in a left column with the fields in
 * a card on the right; on phones it stacks like a Card.
 */
/** A form card: title and description at the top, fields below. Same look on every form. */
export function FormSection({
  title,
  description,
  children,
  className = "",
  flat = false,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  /** No card around it: for forms inside a pop-up. */
  flat?: boolean;
}) {
  if (flat) {
    return (
      <section className={`border-t border-stone-100 pt-5 first:border-0 first:pt-0 ${className}`}>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <div className="mt-0.5 mb-3 text-xs text-stone-500">{description}</div>}
        <div className={description ? "" : "mt-3"}>{children}</div>
      </section>
    );
  }
  return (
    <section className={`max-w-3xl rounded-2xl border border-stone-200 bg-white ${className}`}>
      <div className="border-b border-stone-100 px-4 py-4 sm:px-5">
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <div className="mt-0.5 text-sm text-stone-500">{description}</div>}
      </div>
      <div className="min-w-0 p-4 sm:p-5">{children}</div>
    </section>
  );
}

/** Submit row under FormSection cards (right-aligned from sm up). */
export function FormActions({ children }: { children: ReactNode }) {
  return <div className="flex max-w-3xl flex-wrap items-center gap-3 sm:justify-end">{children}</div>;
}
