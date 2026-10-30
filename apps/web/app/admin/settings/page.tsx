import { getPlatformSettings } from "@cataloglink/core/platform";
import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { updateSettingsAction, uploadTemplateAction } from "./actions";
import { SettingsForm, TemplateUploadForm } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireSuperAdmin();
  const settings = await getPlatformSettings();

  return (
    <>
      <PageHeader title="Platform settings" />
      <div className="space-y-4">
        <Card title="Defaults">
          <SettingsForm action={updateSettingsAction} values={settings} />
        </Card>

        <Card title="Google Sheet template">
          <p className="mb-3 text-sm text-stone-600">
            The Excel file clients download to start their product sheet. A ready-made template with all columns ships in
            Milestone 3; you can replace it here at any time.
          </p>
          {settings.sheetTemplate ? (
            <p className="mb-3 text-sm">
              Current:{" "}
              <a href="/api/v1/sheet-template" className="font-medium text-brand-600 underline">
                {settings.sheetTemplate.fileName}
              </a>{" "}
              <span className="text-stone-500">
                ({Math.round(settings.sheetTemplate.size / 1024)} KB, uploaded {formatDateTime(settings.sheetTemplate.uploadedAt)})
              </span>
            </p>
          ) : (
            <p className="mb-3 text-sm text-stone-500">No template uploaded yet.</p>
          )}
          <TemplateUploadForm action={uploadTemplateAction} />
        </Card>

        <Card title="Notification templates">
          <p className="text-sm text-stone-500">On hold. Email and WhatsApp notifications will be added later.</p>
        </Card>
      </div>
    </>
  );
}
