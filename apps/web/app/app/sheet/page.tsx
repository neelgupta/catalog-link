import { isDomainError } from "@cataloglink/core/errors";
import { oauthConfigured, serviceAccountEmail } from "@cataloglink/core/google";
import { getPendingSync, listAccountSpreadsheets } from "@cataloglink/core/sync";
import { prisma } from "@cataloglink/db";
import type { Metadata } from "next";
import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import {
  Badge,
  Card,
  Detail,
  EmptyState,
  FormError,
  FormSuccess,
  PageHeader,
} from "@/components/ui";
import { requireClient } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import {
  disconnectSheetAction,
  inspectLinkAction,
  startGoogleOAuthAction,
  syncNowAction,
} from "./actions";
import { CopyText, GoogleButton, PasteLinkForm } from "./connect-forms";
import { SyncControls } from "./sync-controls";

export const metadata: Metadata = { title: "Google Sheet" };

const ERRORS: Record<string, string> = {
  oauth_state: "The Google sign-in link expired or was already used. Please try again.",
  oauth_cancelled: "Google access was not granted.",
  oauth_failed: "Connecting to Google failed. Please try again.",
  GOOGLE_NO_REFRESH_TOKEN:
    "Google didn't grant offline access. Remove CatalogLink from your Google account's third-party access, then connect again.",
  GOOGLE_SCOPES_MISSING:
    "Please tick both permissions (Google Sheets and Google Drive) when connecting.",
  GOOGLE_OAUTH_NOT_CONFIGURED:
    "Google sign-in isn't set up yet. Use the share-with-us option instead.",
};
const NOTICES: Record<string, string> = {
  google: "Google account connected. Now choose the spreadsheet with your products.",
  sheet: "Sheet connected. Your first sync has started.",
};
const RUN_TONE = {
  QUEUED: "stone",
  RUNNING: "blue",
  SUCCESS: "green",
  PARTIAL: "amber",
  FAILED: "red",
} as const;
const RUN_LABEL = {
  QUEUED: "Queued",
  RUNNING: "Running",
  SUCCESS: "Synced",
  PARTIAL: "Synced with errors",
  FAILED: "Failed",
} as const;

export default async function SheetPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string; disconnected?: string }>;
}) {
  const { clientId } = await requireClient();
  const sp = await searchParams;
  const conn = await prisma.sheetConnection.findUnique({ where: { clientId } });
  const ready = !!conn?.spreadsheetId && !!conn.sheetName;

  return (
    <>
      <PageHeader
        title="Google Sheet"
        subtitle="Your products come from one Google Sheet. Edit the sheet; the catalog link follows."
      />
      <div className="mb-4 space-y-2">
        {sp.error && (
          <FormError message={ERRORS[sp.error] ?? "Something went wrong. Please try again."} />
        )}
        {sp.connected && NOTICES[sp.connected] && <FormSuccess message={NOTICES[sp.connected]} />}
        {sp.disconnected && (
          <FormSuccess message="Sheet disconnected. Your products stay on the catalog link until you connect a sheet again." />
        )}
      </div>
      {ready ? (
        <Connected clientId={clientId} conn={conn} />
      ) : (
        <Connect clientId={clientId} conn={conn} />
      )}
    </>
  );
}

// ───────────────────────────── Not connected yet ─────────────────────────────

async function Connect({
  clientId,
  conn,
}: {
  clientId: string;
  conn: Awaited<ReturnType<typeof prisma.sheetConnection.findUnique>>;
}) {
  const saEmail = serviceAccountEmail();
  const googleReady = oauthConfigured();
  const oauthConnected = conn?.mode === "OAUTH" && !!conn.oauthRefreshTokenEnc;

  let spreadsheets: { id: string; name: string }[] | null = null;
  let listError: string | undefined;
  if (oauthConnected) {
    try {
      spreadsheets = (await listAccountSpreadsheets(clientId)) ?? [];
    } catch (err) {
      if (!isDomainError(err)) throw err;
      listError = err.message;
    }
  }

  return (
    <div className="space-y-4">
      <Card title="1. Start from our template">
        <p className="mb-3 text-sm text-stone-600">
          Download the template, upload it to Google Drive and open it with Google Sheets. One row =
          one product. Put product photos in Google Drive and paste their links in the &quot;Image
          Links&quot; column.
        </p>
        <a
          href="/api/v1/sheet-template"
          className="inline-flex h-10 items-center rounded-lg border border-stone-300 bg-white px-4 text-sm font-medium hover:bg-stone-50"
        >
          Download template (.xlsx)
        </a>
      </Card>

      <Card title="2. Connect your sheet">
        <div className="grid gap-6 md:grid-cols-2">
          <section className="min-w-0">
            <h3 className="mb-1 text-sm font-semibold">Option A: Sign in with Google</h3>
            {oauthConnected ? (
              <div className="space-y-3">
                <p className="text-sm text-stone-600">
                  Connected as <strong>{conn.googleEmail ?? "your Google account"}</strong>. Choose
                  the spreadsheet:
                </p>
                <FormError message={listError} />
                {spreadsheets && spreadsheets.length === 0 && (
                  <EmptyState>No spreadsheets found in this Google account.</EmptyState>
                )}
                {spreadsheets && spreadsheets.length > 0 && (
                  <ul className="max-h-72 divide-y divide-stone-100 overflow-y-auto rounded-xl border border-stone-200">
                    {spreadsheets.map((s) => (
                      <li key={s.id}>
                        <Link
                          href={`/app/sheet/select?mode=OAUTH&id=${encodeURIComponent(s.id)}`}
                          className="block px-3 py-2.5 text-sm hover:bg-stone-50"
                        >
                          {s.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                <GoogleButton action={startGoogleOAuthAction} />
              </div>
            ) : googleReady ? (
              <div className="space-y-3">
                <p className="text-sm text-stone-600">
                  Pick your sheet from your Google account. You can choose any spreadsheet you own.
                </p>
                <GoogleButton action={startGoogleOAuthAction} />
              </div>
            ) : (
              <p className="text-sm text-stone-500">
                Google sign-in is being set up and will be available soon. Use option B meanwhile.
              </p>
            )}
          </section>

          <section className="min-w-0">
            <h3 className="mb-1 text-sm font-semibold">
              Option B: Share the sheet with CatalogLink
            </h3>
            {saEmail ? (
              <div className="space-y-3">
                <ol className="list-decimal space-y-1 pl-5 text-sm text-stone-600">
                  <li>
                    In Google Sheets, press <strong>Share</strong> and add this email as{" "}
                    <strong>Editor</strong>:
                  </li>
                </ol>
                <CopyText text={saEmail} />
                <ol start={2} className="list-decimal space-y-1 pl-5 text-sm text-stone-600">
                  <li>
                    Share your product image folder(s) with the same email (Viewer), or set them to
                    &quot;Anyone with the link&quot;.
                  </li>
                  <li>Paste the sheet link below.</li>
                </ol>
                <PasteLinkForm action={inspectLinkAction} />
              </div>
            ) : (
              <p className="text-sm text-stone-500">
                Not available yet: the service account is not configured on the server.
              </p>
            )}
          </section>
        </div>
      </Card>
    </div>
  );
}

// ───────────────────────────────── Connected ─────────────────────────────────

async function Connected({
  clientId,
  conn,
}: {
  clientId: string;
  conn: NonNullable<Awaited<ReturnType<typeof prisma.sheetConnection.findUnique>>>;
}) {
  const [runs, pending, pendingImages, failedImages, counts] = await Promise.all([
    prisma.syncRun.findMany({
      where: { clientId },
      orderBy: { startedAt: "desc" },
      take: 10,
      include: { rowErrors: { orderBy: { rowNumber: "asc" }, take: 200 } },
    }),
    getPendingSync(clientId),
    prisma.productImage.count({ where: { clientId, status: "PENDING" } }),
    prisma.productImage.findMany({
      where: { clientId, status: "FAILED", product: { removedFromSheetAt: null } },
      take: 50,
      orderBy: { updatedAt: "desc" },
      include: { product: { select: { sku: true, sheetRow: true } } },
    }),
    prisma.product.groupBy({
      by: ["sheetActive"],
      where: { clientId, removedFromSheetAt: null },
      _count: true,
    }),
  ]);
  const last = runs[0];
  const busy = !!pending || last?.status === "RUNNING";
  const active = counts.find((c) => c.sheetActive)?._count ?? 0;
  const hidden = counts.find((c) => !c.sheetActive)?._count ?? 0;
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${conn.spreadsheetId}/edit`;

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3 lg:gap-6">
      <div className="min-w-0 space-y-4 lg:col-span-2 lg:space-y-6">
        <Card>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <dl className="min-w-0 flex-1 divide-y divide-stone-100">
              <Detail label="Spreadsheet">
                <a
                  href={sheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-600 underline"
                >
                  {conn.spreadsheetTitle ?? conn.spreadsheetId}
                </a>
              </Detail>
              <Detail label="Tab">{conn.sheetName}</Detail>
              <Detail label="Connected via">
                {conn.mode === "OAUTH"
                  ? `Google account${conn.googleEmail ? ` (${conn.googleEmail})` : ""}`
                  : "Shared with CatalogLink"}
              </Detail>
              <Detail label="Last sync">
                {conn.lastSyncedAt ? formatDateTime(conn.lastSyncedAt) : "Not yet"}{" "}
                {last && <Badge tone={RUN_TONE[last.status]}>{RUN_LABEL[last.status]}</Badge>}
              </Detail>
              <Detail label="Products">
                {active} on the link{hidden > 0 && ` · ${hidden} hidden (Active = No)`}
              </Detail>
            </dl>
          </div>
          <div className="mt-4">
            <SyncControls action={syncNowAction} initial={{ busy, images: pendingImages }} />
            <p className="mt-2 text-xs text-stone-500">
              The sheet is also synced automatically every few minutes. Press Sync now after adding
              photos to an image folder.
            </p>
          </div>
        </Card>

        {last && <LastRun run={last} />}

        {failedImages.length > 0 && (
          <Card title={`Images that couldn't be loaded (${failedImages.length})`}>
            <ul className="divide-y divide-stone-100 text-sm">
              {failedImages.map((img) => (
                <li key={img.id} className="py-2">
                  <span className="font-medium">Row {img.product.sheetRow}</span> ({img.product.sku}
                  ), image {img.position + 1}: <span className="text-stone-600">{img.error}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <div className="min-w-0 space-y-4 lg:space-y-6">
        {runs.length > 1 && (
          <Card title="Sync history">
            <ul className="divide-y divide-stone-100 text-sm">
              {runs.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {formatDateTime(r.startedAt)}{" "}
                    <span className="text-stone-500">
                      · {r.trigger === "MANUAL" ? "Sync now" : "Automatic"}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 text-xs text-stone-500">
                    {r.status !== "FAILED" &&
                      r.status !== "RUNNING" &&
                      `+${r.rowsAdded} · ~${r.rowsUpdated} · −${r.rowsRemoved}`}
                    <Badge tone={RUN_TONE[r.status]}>{RUN_LABEL[r.status]}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card title="Change or disconnect">
          <div className="flex flex-wrap gap-3">
            <Link
              href={
                conn.mode === "OAUTH"
                  ? `/app/sheet/select?mode=OAUTH&id=${encodeURIComponent(conn.spreadsheetId!)}`
                  : `/app/sheet/select?mode=SERVICE_ACCOUNT&id=${encodeURIComponent(conn.spreadsheetId!)}`
              }
              className="inline-flex h-10 items-center rounded-lg border border-stone-300 bg-white px-4 text-sm font-medium hover:bg-stone-50"
            >
              Choose another tab
            </Link>
            <form action={disconnectSheetAction}>
              <SubmitButton
                variant="ghost"
                confirm="Disconnect this sheet? Products stay on your link until you connect a sheet again."
              >
                Disconnect sheet
              </SubmitButton>
            </form>
          </div>
        </Card>
      </div>
    </div>
  );
}

function LastRun({
  run,
}: {
  run: {
    status: keyof typeof RUN_TONE;
    startedAt: Date;
    rowsTotal: number;
    rowsAdded: number;
    rowsUpdated: number;
    rowsSkipped: number;
    rowsRemoved: number;
    errorMessage: string | null;
    rowErrors: {
      id: string;
      rowNumber: number;
      sku: string | null;
      code: string;
      message: string;
    }[];
  };
}) {
  if (run.status === "RUNNING") return null;
  return (
    <Card title="Last sync">
      {run.status === "FAILED" ? (
        <FormError message={run.errorMessage ?? "Sync failed."} />
      ) : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
            {[
              ["Rows read", run.rowsTotal],
              ["Added", run.rowsAdded],
              ["Updated", run.rowsUpdated],
              ["Removed", run.rowsRemoved],
              ["Skipped", run.rowsSkipped],
            ].map(([label, n]) => (
              <div key={label} className="rounded-lg bg-stone-50 px-3 py-2">
                <p className="text-xs text-stone-500">{label}</p>
                <p className="font-semibold tabular-nums">{n}</p>
              </div>
            ))}
          </div>
          {run.rowErrors.length === 0 ? (
            <p className="text-sm text-green-700">Every row was imported.</p>
          ) : (
            <>
              <p className="mb-2 text-sm text-stone-600">
                Fix these rows in your sheet; they&apos;ll be picked up on the next sync.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-stone-500">
                    <tr>
                      <th className="py-1.5 pr-3 font-medium">Row</th>
                      <th className="py-1.5 pr-3 font-medium">SKU</th>
                      <th className="py-1.5 font-medium">Problem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {run.rowErrors.map((e) => (
                      <tr key={e.id}>
                        <td className="py-1.5 pr-3 tabular-nums">{e.rowNumber}</td>
                        <td className="py-1.5 pr-3 whitespace-nowrap">{e.sku ?? "—"}</td>
                        <td className="py-1.5">{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </Card>
  );
}
