"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CancelOrderButton({ slug, orderNo }: { slug: string; orderNo: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm text-red-700 underline">
        Cancel this order
      </button>
    );
  }
  return (
    <div className="space-y-2 rounded-xl bg-red-50 p-3">
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Reason (optional)</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className="h-10 w-full rounded-lg border border-stone-300 bg-white px-3 text-base sm:text-sm" />
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            const res = await fetch(`/api/v1/public/c/${slug}/orders/${orderNo}/cancel`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ reason }),
            });
            setBusy(false);
            if (res.ok) return router.refresh();
            const body = await res.json().catch(() => ({}));
            setError(body.error?.message ?? "Could not cancel the order.");
          }}
          className="h-10 rounded-full bg-red-600 px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Cancelling…" : "Yes, cancel order"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="h-10 px-3 text-sm text-stone-600">
          Keep order
        </button>
      </div>
    </div>
  );
}
