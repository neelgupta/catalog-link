"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Modal, useFlash } from "@/components/modal";
import { Button, EmptyState, LinkButton } from "@/components/ui";
import { createClientAction, updateClientAction } from "./actions";
import { ClientForm } from "./client-form";

type Plan = { id: string; name: string; durationDays: number };
type ClientValues = Parameters<typeof ClientForm>[0]["client"];

/** Drops a `?add=1` / `?edit=1` from the address once its pop-up closes, so a refresh doesn't reopen it. */
function useCloseParam(initiallyOpen: boolean) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(initiallyOpen);
  const close = useCallback(() => {
    setOpen(false);
    if (initiallyOpen) router.replace(pathname, { scroll: false });
  }, [initiallyOpen, pathname, router]);
  return [open, setOpen, close] as const;
}

/** "Add client" button + pop-up. Creating a client opens its page. */
export function AddClientDialog({ plans, initiallyOpen = false }: { plans: Plan[]; initiallyOpen?: boolean }) {
  const [open, setOpen, close] = useCloseParam(initiallyOpen);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Add client
      </Button>
      <Modal open={open} onClose={close} title="Add client" size="max-w-2xl">
        {plans.length === 0 ? (
          <EmptyState>
            Create an active plan first.
            <span className="mt-3 block">
              <LinkButton href="/admin/plans">Go to plans</LinkButton>
            </span>
          </EmptyState>
        ) : (
          <ClientForm action={createClientAction} plans={plans} onSaved={close} />
        )}
      </Modal>
    </>
  );
}

/** "Edit" button + pop-up for a client's business details and logo. */
export function EditClientDialog({ clientId, client, initiallyOpen = false }: { clientId: string; client: NonNullable<ClientValues>; initiallyOpen?: boolean }) {
  const [open, setOpen, close] = useCloseParam(initiallyOpen);
  const [flashNode, flash] = useFlash();
  // A new form each time it opens, so it starts from the saved details.
  const [round, setRound] = useState(0);
  const onSaved = useCallback(
    (message?: string) => {
      close();
      flash(message);
    },
    [close, flash],
  );
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          setRound((r) => r + 1);
          setOpen(true);
        }}
      >
        Edit
      </Button>
      {flashNode}
      <Modal open={open} onClose={close} title={`Edit ${client.businessName}`} size="max-w-2xl">
        <ClientForm key={round} action={updateClientAction.bind(null, clientId)} client={client} onSaved={onSaved} />
      </Modal>
    </>
  );
}
