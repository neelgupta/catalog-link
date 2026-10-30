"use client";

import { SIMPLE_ORDER_FLOW } from "@cataloglink/core/order-status";
import type { OrderStatus } from "@cataloglink/db";
import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Button, FormError, FormSuccess } from "@/components/ui";
import type { ActionState } from "@/lib/actions";
import { changeStatusAction, paymentAction } from "./actions";

const NEXT_STEP: Partial<Record<OrderStatus, { to: OrderStatus; label: string; hint: string }>> = {
  PLACED: { to: "CONFIRMED", label: "Confirm order", hint: "You have the stock and will send this order." },
  CONFIRMED: { to: "PACKED", label: "Mark packed", hint: "The parcel is packed and ready to go." },
  PARTIALLY_CONFIRMED: { to: "PACKED", label: "Mark packed", hint: "The parcel is packed and ready to go." },
  PACKED: { to: "DISPATCHED", label: "Mark dispatched", hint: "Handed to the transport / courier." },
  DISPATCHED: { to: "DELIVERED", label: "Mark delivered", hint: "The customer has received it." },
};

function StepForm({ orderId, to, label, withNote }: { orderId: string; to: OrderStatus; label: string; withNote: boolean }) {
  const [state, action] = useActionState(changeStatusAction.bind(null, orderId, to), {} as ActionState);
  return (
    <form action={action} className="space-y-2">
      {withNote && (
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-stone-700">Transport / LR number (optional)</span>
          <input name="note" maxLength={300} placeholder="e.g. VRL Logistics, LR 4471" className="h-10 w-full rounded-lg border border-stone-300 px-3 text-base outline-none focus:border-brand-500 sm:text-sm" />
        </label>
      )}
      <SubmitButton className="w-full" pendingText="Saving…">
        {label}
      </SubmitButton>
      <FormError message={state.error} />
      <FormSuccess message={state.ok ? state.message : undefined} />
    </form>
  );
}

function CloseForm({ orderId, to, onCancel }: { orderId: string; to: "REJECTED" | "CANCELLED"; onCancel: () => void }) {
  const [state, action] = useActionState(changeStatusAction.bind(null, orderId, to), {} as ActionState);
  const verb = to === "REJECTED" ? "Reject" : "Cancel";
  return (
    <form action={action} className="space-y-2 rounded-xl bg-red-50 p-3">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-stone-800">Reason (the customer sees this)</span>
        <input
          name="reason"
          required
          maxLength={300}
          autoFocus
          placeholder={to === "REJECTED" ? "e.g. This design is sold out" : "e.g. Customer asked to cancel"}
          className="h-10 w-full rounded-lg border border-stone-300 bg-white px-3 text-base outline-none focus:border-brand-500 sm:text-sm"
        />
      </label>
      <p className="text-xs text-stone-600">The held stock goes back to your catalog.</p>
      <FormError message={state.error} />
      <div className="flex gap-2">
        <SubmitButton variant="danger" pendingText={`${verb}ing…`}>
          {verb} order
        </SubmitButton>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Keep order
        </Button>
      </div>
    </form>
  );
}

/** The next status step, reject / cancel with a reason. */
export function StatusActions({ orderId, status }: { orderId: string; status: OrderStatus }) {
  const [closing, setClosing] = useState(false);
  // For now: only New → Completed (core/orders/status.ts SIMPLE_ORDER_FLOW).
  if (SIMPLE_ORDER_FLOW) {
    if (status === "DELIVERED" || status === "REJECTED" || status === "CANCELLED") {
      return <p className="text-sm text-stone-500">No further steps for this order.</p>;
    }
    return (
      <div className="space-y-3">
        <p className="text-sm text-stone-600">Mark the order completed once it has been sent to the customer.</p>
        <StepForm orderId={orderId} to="DELIVERED" label="Mark as completed" withNote={false} />
      </div>
    );
  }
  const step = NEXT_STEP[status];
  const closeTo = status === "PLACED" ? "REJECTED" : ["CONFIRMED", "PARTIALLY_CONFIRMED", "PACKED"].includes(status) ? "CANCELLED" : null;

  if (!step && !closeTo) return <p className="text-sm text-stone-500">No further steps for this order.</p>;
  return (
    <div className="space-y-3">
      {step && !closing && (
        <>
          <p className="text-sm text-stone-600">{step.hint}</p>
          <StepForm key={status} orderId={orderId} to={step.to} label={step.label} withNote={step.to === "DISPATCHED"} />
        </>
      )}
      {closeTo &&
        (closing ? (
          <CloseForm orderId={orderId} to={closeTo} onCancel={() => setClosing(false)} />
        ) : (
          <button type="button" onClick={() => setClosing(true)} className="text-sm text-red-700 underline">
            {closeTo === "REJECTED" ? "Reject this order" : "Cancel this order"}
          </button>
        ))}
    </div>
  );
}

export function PaymentToggle({ orderId, received }: { orderId: string; received: boolean }) {
  const [state, action] = useActionState<ActionState>(() => paymentAction(orderId, !received), {});
  return (
    <form action={action} className="space-y-2">
      <SubmitButton variant={received ? "ghost" : "secondary"} className="w-full" pendingText="Saving…">
        {received ? "Mark as not received" : "Mark payment received"}
      </SubmitButton>
      <FormError message={state.error} />
    </form>
  );
}
