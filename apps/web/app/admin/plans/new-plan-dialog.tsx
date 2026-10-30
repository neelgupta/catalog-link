"use client";

import { useCallback, useState } from "react";
import { Modal } from "@/components/modal";
import { Button, FormSuccess } from "@/components/ui";
import { createPlanAction } from "./actions";
import { PlanForm } from "./plan-form";

/** "Add plan" button that opens the new-plan form in a pop-up and closes it once the plan is saved. */
export function NewPlanDialog() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string>();
  const onSaved = useCallback((m?: string) => {
    setOpen(false);
    setMessage(m);
    setTimeout(() => setMessage(undefined), 4000);
  }, []);

  return (
    <>
      <Button
        type="button"
        onClick={() => {
          setMessage(undefined);
          setOpen(true);
        }}
      >
        Add plan
      </Button>
      {message && (
        <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-lg shadow-lg sm:right-6 sm:left-auto">
          <FormSuccess message={message} />
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="New plan">
        <PlanForm action={createPlanAction} submitLabel="Create plan" onSaved={onSaved} />
      </Modal>
    </>
  );
}
