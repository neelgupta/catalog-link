export function Avatar({ name, logoUrl, size = "size-10" }: { name: string; logoUrl: string | null; size?: string }) {
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- small local logo, no optimisation needed
    return <img src={logoUrl} alt="" className={`${size} shrink-0 rounded-lg border border-stone-200 object-cover`} />;
  }
  return (
    <span
      className={`${size} flex shrink-0 items-center justify-center rounded-lg bg-brand-100 text-sm font-semibold text-brand-700`}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
