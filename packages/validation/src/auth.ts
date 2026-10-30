import { z } from "zod";
import { emailSchema, mobileSchema, otpCodeSchema } from "./common";

export const passwordLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password"),
});
export type PasswordLoginInput = z.infer<typeof passwordLoginSchema>;

export const otpSendSchema = z.object({
  mobile: mobileSchema,
});
export type OtpSendInput = z.infer<typeof otpSendSchema>;

export const otpVerifySchema = z.object({
  mobile: mobileSchema,
  code: otpCodeSchema,
});
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;
