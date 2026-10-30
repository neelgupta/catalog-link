const IST = "Asia/Kolkata";

export function formatDate(date: Date | string | null | undefined) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: IST }).format(
    new Date(date),
  );
}

export function formatDateTime(date: Date | string | null | undefined) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: IST,
  }).format(new Date(date));
}

/** YYYY-MM-DD for <input type="date"> (IST calendar date). */
export function dateInputValue(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: IST }).format(date);
}

export function formatRupees(amount: number | string | { toString(): string }) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(
    Number(amount.toString()),
  );
}
