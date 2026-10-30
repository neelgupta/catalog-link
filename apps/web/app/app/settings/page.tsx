import { getClientSettings } from "@cataloglink/core/profile";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireClient } from "@/lib/auth";
import { updateSettingsAction } from "./actions";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { clientId } = await requireClient();
  const s = await getClientSettings(clientId);
  return (
    <>
      <PageHeader title="Settings" subtitle="How stock shows on your links and how often your sheet syncs." />
      <SettingsForm
        action={updateSettingsAction}
        settings={{
          outOfStockMode: s.outOfStockMode,
          lowStockThreshold: s.lowStockThreshold,
          writeOrdersTab: s.writeOrdersTab,
          syncIntervalMin: s.syncIntervalMin,
          newArrivalDays: s.newArrivalDays,
        }}
        defaults={{ syncIntervalMin: s.platform.defaultSyncIntervalMin, newArrivalDays: s.platform.newArrivalDays }}
      />
    </>
  );
}
