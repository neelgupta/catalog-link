"use client";

import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useCallback, useState } from "react";
import { Modal, useFlash } from "@/components/modal";
import { deletePlanAction, updatePlanAction } from "./actions";
import { DeletePlanForm } from "./[id]/delete-plan-form";
import { PlanForm } from "./plan-form";

type PlanValues = NonNullable<Parameters<typeof PlanForm>[0]["plan"]> & { id: string };

/** A plan card that opens the plan in a pop-up for editing (and deleting, if never assigned). */
export function EditPlanDialog({
  plan,
  assigned,
  initiallyOpen = false,
  children,
}: {
  plan: PlanValues;
  /** How many times the plan was given to a client; such plans are kept for history. */
  assigned: number;
  initiallyOpen?: boolean;
  /** The card's content. */
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(initiallyOpen);
  const [round, setRound] = useState(0);
  const [flashNode, flash] = useFlash();
  const close = useCallback(() => {
    setOpen(false);
    if (initiallyOpen) router.replace(pathname, { scroll: false });
  }, [initiallyOpen, pathname, router]);
  const done = useCallback(
    (message?: string) => {
      close();
      flash(message);
    },
    [close, flash],
  );

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setRound((r) => r + 1);
          setOpen(true);
        }}
        className="block w-full rounded-2xl border border-stone-200 bg-white p-4 text-left transition hover:border-stone-300 hover:shadow-sm"
      >
        {children}
      </button>
      {flashNode}
      <Modal open={open} onClose={close} title={`Edit ${plan.name}`}>
        <div key={round} className="space-y-6">
          <p className="-mt-1 text-sm text-stone-500">Changes to limits apply to every client on this plan.</p>
          <PlanForm action={updatePlanAction.bind(null, plan.id)} plan={plan} submitLabel="Save plan" onSaved={done} />
          <section className="border-t border-stone-100 pt-5">
            <h3 className="mb-2 text-sm font-semibold">Delete plan</h3>
            {assigned > 0 ? (
              <p className="text-sm text-stone-600">
                This plan has been assigned {assigned} time(s), so it is kept for history. Untick &quot;Active&quot; above to stop offering it.
              </p>
            ) : (
              <DeletePlanForm action={deletePlanAction.bind(null, plan.id)} />
            )}
          </section>
        </div>
      </Modal>
    </>
  );
}
