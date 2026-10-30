import { z } from "zod";

/** Indian mobile number. Accepts "+91 98765 43210", "09876543210", "9876543210"; outputs "9876543210". */
export const mobileSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, "").replace(/^(\+91|91|0)(?=\d{10}$)/, ""))
  .pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"));

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email"));

export const otpCodeSchema = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit OTP");
