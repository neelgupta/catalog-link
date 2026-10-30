import { prisma } from "@cataloglink/db";
import type { PlatformSettingsInput } from "@cataloglink/validation";
import { DomainError } from "./errors";
import { getStorage, isZip } from "./storage";

export const PLATFORM_DEFAULTS: PlatformSettingsInput = { defaultSyncIntervalMin: 5, newArrivalDays: 7 };

const KEYS = {
  defaultSyncIntervalMin: "sync.defaultIntervalMin",
  newArrivalDays: "catalog.newArrivalDays",
  sheetTemplate: "sheet.template",
} as const;

export type SheetTemplateInfo = { key: string; fileName: string; size: number; uploadedAt: string };

export const MAX_TEMPLATE_BYTES = 5 * 1024 * 1024;

async function getValues(keys: string[]) {
  const rows = await prisma.platformSetting.findMany({ where: { key: { in: keys } } });
  return new Map(rows.map((r) => [r.key, r.value]));
}

export async function getPlatformSettings(): Promise<PlatformSettingsInput & { sheetTemplate: SheetTemplateInfo | null }> {
  const values = await getValues(Object.values(KEYS));
  const num = (key: string, fallback: number) => {
    const v = values.get(key);
    return typeof v === "number" ? v : fallback;
  };
  return {
    defaultSyncIntervalMin: num(KEYS.defaultSyncIntervalMin, PLATFORM_DEFAULTS.defaultSyncIntervalMin),
    newArrivalDays: num(KEYS.newArrivalDays, PLATFORM_DEFAULTS.newArrivalDays),
    sheetTemplate: (values.get(KEYS.sheetTemplate) as SheetTemplateInfo | undefined) ?? null,
  };
}

async function setValue(key: string, value: unknown) {
  await prisma.platformSetting.upsert({
    where: { key },
    update: { value: value as never },
    create: { key, value: value as never },
  });
}

export async function updatePlatformSettings(input: PlatformSettingsInput) {
  await setValue(KEYS.defaultSyncIntervalMin, input.defaultSyncIntervalMin);
  await setValue(KEYS.newArrivalDays, input.newArrivalDays);
}

/** Stores the downloadable Google Sheet template (.xlsx) offered to clients during onboarding. */
export async function saveSheetTemplate(fileName: string, data: Buffer): Promise<SheetTemplateInfo> {
  if (!fileName.toLowerCase().endsWith(".xlsx") || !isZip(data)) {
    throw new DomainError("TEMPLATE_TYPE", "Upload an Excel .xlsx file", "template");
  }
  if (data.length > MAX_TEMPLATE_BYTES) throw new DomainError("TEMPLATE_TOO_LARGE", "Template must be 5 MB or smaller", "template");

  const previous = (await getPlatformSettings()).sheetTemplate;
  const key = `platform/sheet-template-${Date.now()}.xlsx`;
  await getStorage().save(key, data);
  const info: SheetTemplateInfo = { key, fileName, size: data.length, uploadedAt: new Date().toISOString() };
  await setValue(KEYS.sheetTemplate, info);
  if (previous && previous.key !== key) await getStorage().remove(previous.key).catch(() => undefined);
  return info;
}
