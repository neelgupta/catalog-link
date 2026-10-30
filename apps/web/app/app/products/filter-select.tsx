"use client";

/** A filter dropdown that applies itself as soon as it changes (the form still works without JS via Search). */
export function FilterSelect({
  name,
  value,
  label,
  allLabel,
  options,
}: {
  name: string;
  value: string;
  label: string;
  allLabel: string;
  options: [string, string][];
}) {
  return (
    <select
      name={name}
      defaultValue={value}
      aria-label={label}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className="h-10 w-full min-w-0 rounded-lg border border-stone-300 bg-white px-2 text-base outline-none focus:border-brand-500 sm:text-sm"
    >
      <option value="">{allLabel}</option>
      {options.map(([v, text]) => (
        <option key={v} value={v}>
          {text}
        </option>
      ))}
    </select>
  );
}
