import { Prisma, prisma } from "@cataloglink/db";
import type { ClientSettingsInput, ProfileInput } from "@cataloglink/validation";
import { DomainError } from "./errors";
import { getPlatformSettings } from "./platform";
import { getStorage, sniffImage } from "./storage";

export type BankDetails = {
  accountName: string;
  accountNumber: string;
  ifsc: string;
  bankName?: string;
  branch?: string;
};

export type ClientSettings = {
  outOfStockMode: "badge" | "hide";
  lowStockThreshold: number;
  writeOrdersTab: boolean;
  /** Null = platform default. */
  syncIntervalMin: number | null;
  /** Null = platform default. */
  newArrivalDays: number | null;
};

const IMAGE_RULES = {
  logo: { maxBytes: 2 * 1024 * 1024, label: "Logo" },
  banner: { maxBytes: 5 * 1024 * 1024, label: "Banner" },
  upiQr: { maxBytes: 2 * 1024 * 1024, label: "UPI QR" },
} as const;
export type ClientImageKind = keyof typeof IMAGE_RULES;

/** Validates an uploaded logo / banner / UPI QR and stores it; returns its public URL. */
export async function saveClientImage(clientId: string, kind: ClientImageKind, data: Buffer) {
  const rule = IMAGE_RULES[kind];
  if (data.length > rule.maxBytes) {
    throw new DomainError("IMAGE_TOO_LARGE", `${rule.label} must be ${rule.maxBytes / 1024 / 1024} MB or smaller`, kind);
  }
  const type = sniffImage(data);
  if (!type) throw new DomainError("IMAGE_TYPE", `${rule.label} must be a PNG, JPG or WebP image`, kind);
  return getStorage().save(`clients/${clientId}/${kind}-${Date.now()}.${type.ext}`, data);
}

export async function removeStoredFile(url: string | null | undefined) {
  const key = url && getStorage().keyFromUrl(url);
  if (key) await getStorage().remove(key).catch(() => undefined);
}

export function parseBankDetails(value: Prisma.JsonValue | null): BankDetails | null {
  const v = value as Partial<BankDetails> | null;
  return v?.accountName && v.accountNumber && v.ifsc ? (v as BankDetails) : null;
}

/** The stored settings JSON with defaults filled in. */
export function parseClientSettings(value: Prisma.JsonValue | null): ClientSettings {
  const v = (value ?? {}) as Record<string, unknown>;
  const positive = (x: unknown) => (typeof x === "number" && Number.isInteger(x) && x > 0 ? x : null);
  return {
    outOfStockMode: v.outOfStockMode === "hide" ? "hide" : "badge",
    lowStockThreshold: typeof v.lowStockThreshold === "number" && v.lowStockThreshold >= 0 ? v.lowStockThreshold : 0,
    writeOrdersTab: v.writeOrdersTab === true,
    syncIntervalMin: positive(v.syncIntervalMin),
    newArrivalDays: positive(v.newArrivalDays),
  };
}

/** Client settings plus the platform defaults they fall back to. */
export async function getClientSettings(clientId: string) {
  const [client, platform] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { settings: true } }),
    getPlatformSettings(),
  ]);
  const settings = parseClientSettings(client.settings);
  return {
    ...settings,
    effectiveSyncIntervalMin: settings.syncIntervalMin ?? platform.defaultSyncIntervalMin,
    effectiveNewArrivalDays: settings.newArrivalDays ?? platform.newArrivalDays,
    platform,
  };
}

export async function updateClientSettings(clientId: string, input: ClientSettingsInput) {
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { settings: true } });
  // Keep keys this form doesn't manage.
  const current = (client.settings ?? {}) as Record<string, unknown>;
  const next: Record<string, unknown> = {
    ...current,
    outOfStockMode: input.outOfStockMode,
    lowStockThreshold: input.lowStockThreshold,
    writeOrdersTab: input.writeOrdersTab,
    syncIntervalMin: input.syncIntervalMin ?? null,
    newArrivalDays: input.newArrivalDays ?? null,
  };
  return prisma.client.update({ where: { id: clientId }, data: { settings: next as Prisma.InputJsonValue } });
}

type ImageChange = { upload?: Buffer; remove?: boolean };
export type ProfileImages = Partial<Record<ClientImageKind, ImageChange>>;

const IMAGE_COLUMNS = { logo: "logoUrl", banner: "bannerUrl", upiQr: "upiQrUrl" } as const;

/** Saves the business profile shown on the catalog link (contact, branding, payment details). */
export async function updateProfile(clientId: string, input: ProfileInput, images: ProfileImages = {}) {
  const existing = await prisma.client.findUnique({
    where: { id: clientId },
    select: { logoUrl: true, bannerUrl: true, upiQrUrl: true },
  });
  if (!existing) throw new DomainError("CLIENT_NOT_FOUND", "Client not found");

  // Work out the final image URLs first so the payment checks see the result.
  const urls: Record<ClientImageKind, string | null> = {
    logo: existing.logoUrl,
    banner: existing.bannerUrl,
    upiQr: existing.upiQrUrl,
  };
  const removed: string[] = [];
  const saved: string[] = [];
  try {
    for (const kind of Object.keys(IMAGE_COLUMNS) as ClientImageKind[]) {
      const change = images[kind];
      if (change?.upload?.length) {
        const url = await saveClientImage(clientId, kind, change.upload);
        saved.push(url);
        if (urls[kind]) removed.push(urls[kind]);
        urls[kind] = url;
      } else if (change?.remove && urls[kind]) {
        removed.push(urls[kind]);
        urls[kind] = null;
      }
    }

    if (input.paymentModes.includes("UPI") && !input.upiId && !urls.upiQr) {
      throw new DomainError("UPI_DETAILS_MISSING", "Add a UPI ID or upload a UPI QR code to accept UPI", "upiId");
    }
  } catch (err) {
    await Promise.all(saved.map(removeStoredFile));
    throw err;
  }

  const bankDetails: BankDetails | null =
    input.bankAccountName && input.bankAccountNumber && input.bankIfsc
      ? {
          accountName: input.bankAccountName,
          accountNumber: input.bankAccountNumber,
          ifsc: input.bankIfsc,
          ...(input.bankName ? { bankName: input.bankName } : {}),
          ...(input.bankBranch ? { branch: input.bankBranch } : {}),
        }
      : null;

  const updated = await prisma.client.update({
    where: { id: clientId },
    data: {
      businessName: input.businessName,
      whatsappNumber: input.whatsappNumber ?? null,
      city: input.city,
      address: input.address ?? null,
      gst: input.gst ?? null,
      paymentModes: input.paymentModes,
      upiId: input.upiId ?? null,
      bankDetails: bankDetails ?? Prisma.DbNull,
      logoUrl: urls.logo,
      bannerUrl: urls.banner,
      upiQrUrl: urls.upiQr,
    },
  });
  await Promise.all(removed.map(removeStoredFile));
  return updated;
}
