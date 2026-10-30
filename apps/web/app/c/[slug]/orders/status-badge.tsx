const TONES: Record<string, string> = {
  PLACED: "bg-blue-100 text-blue-800",
  CONFIRMED: "bg-indigo-100 text-indigo-800",
  PARTIALLY_CONFIRMED: "bg-indigo-100 text-indigo-800",
  PACKED: "bg-amber-100 text-amber-800",
  DISPATCHED: "bg-violet-100 text-violet-800",
  DELIVERED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-700",
  CANCELLED: "bg-stone-200 text-stone-700",
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[status] ?? TONES.CANCELLED}`}>{label}</span>;
}
