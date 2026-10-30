/** ₹1,450 for whole rupees, ₹737.50 when there are paise. */
export function rupees(amount: number) {
  const whole = Number.isInteger(amount);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(amount);
}

export function unitLabel(priceType: "PIECE" | "SET") {
  return priceType === "SET" ? "set" : "pc";
}

/** "4 pieces", "1 set", "2 sets" */
export function qtyLabel(qty: number, priceType: "PIECE" | "SET") {
  return priceType === "SET"
    ? `${qty} ${qty === 1 ? "set" : "sets"}`
    : `${qty} ${qty === 1 ? "piece" : "pieces"}`;
}
