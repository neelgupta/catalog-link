import { z } from "zod";
import { gstSchema } from "./admin";
import { mobileSchema } from "./common";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .transform((v) => v || undefined)
    .optional()
    .nullable()
    .transform((v) => v ?? undefined);

/** One cart line as the browser stores it. `price` is what the customer saw, to detect price changes. */
export const cartLineSchema = z.object({
  productId: z.string().min(1).max(40),
  colour: optionalText(60),
  size: optionalText(30),
  qty: z.coerce.number().int().min(1).max(100_000),
  price: z.number().nonnegative().nullable().optional(),
});
export type CartLineInput = z.infer<typeof cartLineSchema>;

export const MAX_CART_LINES = 100;

export const cartSchema = z.object({
  lines: z.array(cartLineSchema).max(MAX_CART_LINES, `A cart can have at most ${MAX_CART_LINES} lines`),
});

export const CHECKOUT_PAYMENT_MODES = ["PAY_LATER", "UPI", "BANK"] as const;

/**
 * "Place Order" details. Only name and mobile are required (the mobile isn't verified for now);
 * the rest is optional so customers can order in seconds.
 */
export const checkoutDetailsSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80, "Name is too long"),
  mobile: mobileSchema,
  gst: gstSchema,
  shopName: optionalText(120),
  city: optionalText(80),
  deliveryAddress: optionalText(500),
  transportPref: optionalText(120),
  notes: optionalText(1000),
  /** Defaults to the seller's first payment option. */
  paymentMode: z.enum(CHECKOUT_PAYMENT_MODES).optional(),
});
export type CheckoutDetailsInput = z.infer<typeof checkoutDetailsSchema>;

export const checkoutSchema = checkoutDetailsSchema.extend({
  lines: z.array(cartLineSchema).min(1, "Your cart is empty").max(MAX_CART_LINES),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;
