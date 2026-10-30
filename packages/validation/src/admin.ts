import { z } from "zod";
import { emailSchema, mobileSchema } from "./common";

const text = (label: string, max = 120) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} is too long`);

const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || undefined)
    .optional();

/** GSTIN: 2-digit state code, PAN, entity number, 'Z', checksum. Optional; stored upper-case. */
export const gstSchema = z
  .string()
  .trim()
  .toUpperCase()
  .transform((v) => v || undefined)
  .pipe(
    z
      .string()
      .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "Enter a valid 15-character GST number")
      .optional(),
  )
  .optional();

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password is too long");

const clientFields = {
  businessName: text("Business name"),
  ownerName: text("Owner name"),
  mobile: mobileSchema,
  email: emailSchema,
  gst: gstSchema,
  city: text("City", 80),
  address: optionalText(),
};

export const clientCreateSchema = z.object({
  ...clientFields,
  password: passwordSchema,
  planId: z.string().min(1, "Choose a plan"),
  trialDays: z.coerce.number().int().min(0).max(365).default(0),
});
export type ClientCreateInput = z.infer<typeof clientCreateSchema>;

export const clientUpdateSchema = z.object(clientFields);
export type ClientUpdateInput = z.infer<typeof clientUpdateSchema>;

export const passwordResetSchema = z.object({ password: passwordSchema });

const intField = (label: string, min = 0) =>
  z.coerce.number({ error: `${label} must be a number` }).int(`${label} must be a whole number`).min(min, `${label} must be at least ${min}`);

export const planSchema = z.object({
  name: text("Plan name", 60),
  maxProducts: intField("Max products", 1),
  maxCustomLinks: intField("Max custom links"),
  maxStaff: intField("Max staff logins"),
  maxOrdersPerMonth: intField("Max orders per month", 1),
  price: z.coerce.number({ error: "Price must be a number" }).min(0, "Price can't be negative"),
  durationDays: intField("Duration", 1),
  isActive: z.coerce.boolean().default(true),
});
export type PlanInput = z.infer<typeof planSchema>;

/** Date from an <input type="date"> (YYYY-MM-DD), as UTC midnight. */
const dateInput = (label: string) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} is required`)
    .transform((v) => new Date(`${v}T00:00:00.000Z`));

export const subscriptionSchema = z
  .object({
    planId: z.string().min(1, "Choose a plan"),
    startAt: dateInput("Start date"),
    expiresAt: dateInput("Expiry date"),
    trialDays: z.coerce.number().int().min(0).max(365).default(0),
  })
  .refine((v) => v.expiresAt > v.startAt, { path: ["expiresAt"], message: "Expiry must be after the start date" });
export type SubscriptionInput = z.infer<typeof subscriptionSchema>;

export const paymentSchema = z.object({
  amount: z.coerce.number({ error: "Amount must be a number" }).positive("Amount must be more than 0"),
  paidAt: dateInput("Payment date"),
  reference: optionalText(120),
  note: optionalText(500),
});
export type PaymentInput = z.infer<typeof paymentSchema>;

export const platformSettingsSchema = z.object({
  defaultSyncIntervalMin: intField("Sync interval", 1).max(1440, "Sync interval must be at most 1440 minutes"),
  newArrivalDays: intField("New arrival days", 1).max(90, "New arrival days must be at most 90"),
});
export type PlatformSettingsInput = z.infer<typeof platformSettingsSchema>;
