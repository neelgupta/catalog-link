import { isDomainError } from "@cataloglink/core/errors";
import { inspectAccountSpreadsheet, inspectSpreadsheetLink } from "@cataloglink/core/sync";
import { prisma } from "@cataloglink/db";
import type { Metadata } from "next";
import { Card, FormError, LinkButton, PageHeader } from "@/components/ui";
import { requireClient } from "@/lib/auth";
import { selectSheetAction } from "../actions";
import { TabForm } from "./tab-form";

export const metadata: Metadata = { title: "Choose tab" };

export default async function SelectTabPage({ searchParams }: { searchParams: Promise<{ mode?: string; id?: string }> }) {
  const { clientId } = await requireClient();
  const sp = await searchParams;
  const mode = sp.mode === "OAUTH" ? "OAUTH" : "SERVICE_ACCOUNT";
  const id = sp.id ?? "";

  let info: { id: string; title: string; tabs: string[] } | undefined;
  let error: string | undefined;
  try {
    info = mode === "OAUTH" ? await inspectAccountSpreadsheet(clientId, id) : await inspectSpreadsheetLink(id);
  } catch (err) {
    if (!isDomainError(err)) throw err;
    error = err.message;
  }
  const conn = await prisma.sheetConnection.findUnique({ where: { clientId }, select: { spreadsheetId: true, sheetName: true } });

  return (
    <>
      <PageHeader title="Choose the products tab" back={{ href: "/app/sheet", label: "Google Sheet" }} subtitle={info?.title} />
      <Card>
        {info ? (
          info.tabs.length ? (
            <TabForm
              action={selectSheetAction.bind(null, mode, info.id)}
              tabs={info.tabs}
              current={conn?.spreadsheetId === info.id ? conn.sheetName : null}
            />
          ) : (
            <FormError message="This spreadsheet has no tabs." />
          )
        ) : (
          <div className="space-y-3">
            <FormError message={error} />
            <LinkButton href="/app/sheet" variant="secondary">Back</LinkButton>
          </div>
        )}
      </Card>
    </>
  );
}
