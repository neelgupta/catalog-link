import { z } from "zod";
import { gstSchema } from "./admin";
import { mobileSchema } from "./common";

const text = (label: string, max = 120) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} is too long`);

const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || undefined)
    .optional();

/** HTML checkbox: "on" when ticked, missing when not. */
const checkbox = z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean());

// ─────────────────────────────── Links ───────────────────────────────

export const LINK_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const linkSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Link address must be at least 3 characters")
  .max(60, "Link address must be at most 60 characters")
  .regex(LINK_SLUG_RE, "Use only letters, numbers and single hyphens, e.g. rangoli-vol-3");

export const LINK_SELECTION_TYPES = ["ALL", "CATEGORY", "CATALOG", "PRODUCTS"] as const;

const linkFields = {
  name: text("Link name", 60),
  selectionType: z.enum(LINK_SELECTION_TYPES, { error: "Choose which products to show" }),
  /** Category names, catalog names or product ids, depending on selectionType. */
  selectionValues: z.array(z.string().trim().min(1).max(200)).max(1000).default([]),
  showPrice: checkbox,
  allowOrdering: checkbox,
  isActive: checkbox,
};

const needsValues = (v: { selectionType: string; selectionValues: string[] }) =>
  v.selectionType === "ALL" || v.selectionValues.length > 0;
const valuesMessage = { path: ["selectionValues"], message: "Choose at least one" };

export const linkCreateSchema = z
  .object({
    ...linkFields,
    /** Empty = generated from the business and link name. */
    slug: z
      .string()
      .trim()
      .transform((v) => v || undefined)
      .pipe(linkSlugSchema.optional())
      .optional(),
  })
  .refine(needsValues, valuesMessage);
export type LinkCreateInput = z.infer<typeof linkCreateSchema>;

/** The link address can't change after creation, because it may already be shared. */
export const linkUpdateSchema = z.object(linkFields).refine(needsValues, valuesMessage);
export type LinkUpdateInput = z.infer<typeof linkUpdateSchema>;

// ────────────────────────────── Profile ──────────────────────────────

export const PAYMENT_MODES = ["PAY_LATER", "UPI", "BANK"] as const;

/** UPI VPA, e.g. shreekrishna@okhdfcbank */
export const upiIdSchema = z
  .string()
  .trim()
  .transform((v) => v || undefined)
  .pipe(z.string().regex(/^[\w.-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/, "Enter a valid UPI ID, e.g. name@okhdfcbank").optional())
  .optional();

const ifscSchema = z
  .string()
  .trim()
  .toUpperCase()
  .transform((v) => v || undefined)
  .pipe(z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Enter a valid 11-character IFSC code").optional())
  .optional();

const accountNumberSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s/g, "") || undefined)
  .pipe(z.string().regex(/^\d{9,18}$/, "Account number must be 9 to 18 digits").optional())
  .optional();

export const profileSchema = z
  .object({
    businessName: text("Business name"),
    whatsappNumber: z
      .string()
      .trim()
      .transform((v) => v || undefined)
      .pipe(mobileSchema.optional())
      .optional(),
    city: text("City", 80),
    address: optionalText(),
    gst: gstSchema,
    paymentModes: z.array(z.enum(PAYMENT_MODES)).min(1, "Choose at least one payment option"),
    upiId: upiIdSchema,
    bankAccountName: optionalText(120),
    bankAccountNumber: accountNumberSchema,
    bankIfsc: ifscSchema,
    bankName: optionalText(120),
    bankBranch: optionalText(120),
  })
  .superRefine((v, ctx) => {
    const anyBank = v.bankAccountName || v.bankAccountNumber || v.bankIfsc || v.bankName || v.bankBranch;
    if (anyBank || v.paymentModes.includes("BANK")) {
      if (!v.bankAccountName) ctx.addIssue({ code: "custom", path: ["bankAccountName"], message: "Account holder name is required" });
      if (!v.bankAccountNumber) ctx.addIssue({ code: "custom", path: ["bankAccountNumber"], message: "Account number is required" });
      if (!v.bankIfsc) ctx.addIssue({ code: "custom", path: ["bankIfsc"], message: "IFSC code is required" });
    }
  });
export type ProfileInput = z.infer<typeof profileSchema>;

// ────────────────────────────── Settings ─────────────────────────────

export const OUT_OF_STOCK_MODES = ["badge", "hide"] as const;

const optionalInt = (label: string, min: number, max: number) =>
  z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? undefined : v),
    z.coerce
      .number({ error: `${label} must be a number` })
      .int(`${label} must be a whole number`)
      .min(min, `${label} must be at least ${min}`)
      .max(max, `${label} must be at most ${max}`)
      .optional(),
  );

export const clientSettingsSchema = z.object({
  outOfStockMode: z.enum(OUT_OF_STOCK_MODES, { error: "Choose how out-of-stock products appear" }),
  /** "Only N left" badge at or below this qty; 0 turns it off. */
  lowStockThreshold: optionalInt("Low stock level", 0, 10000).transform((v) => v ?? 0),
  writeOrdersTab: checkbox,
  /** Empty = platform default. */
  syncIntervalMin: optionalInt("Sync interval", 5, 1440),
  /** Empty = platform default. */
  newArrivalDays: optionalInt("New arrival days", 1, 90),
});
export type ClientSettingsInput = z.infer<typeof clientSettingsSchema>;
