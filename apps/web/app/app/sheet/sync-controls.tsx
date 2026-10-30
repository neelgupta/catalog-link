"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormError } from "@/components/ui";
import type { ActionState } from "@/lib/actions";

type Status = { pendingSince: string | null; lastRun: { status: string } | null; pendingImages: number };
type Live = { busy: boolean; images: number };

/**
 * "Sync now" plus live status. Polls while a sync is queued/running or thumbnails are being made,
 * and refreshes the server-rendered page when either finishes.
 */
export function SyncControls({
  action,
  initial,
}: {
  action: (state: ActionState) => Promise<ActionState>;
  initial: Live;
}) {
  const router = useRouter();
  const [live, setLive] = useState<Live>(initial);
  const prev = useRef<Live>(initial);
  const [state, formAction] = useActionState(async (s: ActionState) => {
    const result = await action(s);
    // A fast sync can finish before the first poll; mark busy now so the page still refreshes.
    if (result.ok) {
      prev.current = { ...prev.current, busy: true };
      setLive((l) => ({ ...l, busy: true }));
    }
    return result;
  }, {});
  const watching = live.busy || live.images > 0;

  useEffect(() => {
    if (!watching) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/v1/client/sync/status", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const s = (await res.json()) as Status;
        const next = { busy: Boolean(s.pendingSince) || s.lastRun?.status === "RUNNING", images: s.pendingImages };
        if ((prev.current.busy && !next.busy) || (prev.current.images > 0 && next.images === 0)) router.refresh();
        prev.current = next;
        setLive(next);
      } catch {
        /* retry on the next tick */
      }
    };
    void tick();
    const id = setInterval(tick, 2500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [watching, router]);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <SubmitButton pendingText="Starting…">Sync now</SubmitButton>
      {live.busy ? (
        <span className="flex items-center gap-2 text-sm text-stone-600" role="status">
          <span className="size-2 animate-pulse rounded-full bg-brand-500" /> Syncing your sheet…
        </span>
      ) : live.images > 0 ? (
        <span className="text-sm text-stone-600" role="status">
          Preparing {live.images} image{live.images === 1 ? "" : "s"}…
        </span>
      ) : null}
      <FormError message={state.error} />
    </form>
  );
}
