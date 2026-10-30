import { prisma } from "@cataloglink/db";
import { getEnv } from "../env";
import { DomainError } from "../errors";
import { OTP_LOGIN_ENABLED, OTP_OFF_MESSAGE } from "../features";
import { createOtpProvider } from "./providers";
import { OtpService, type OtpStore } from "./service";

export * from "./providers";
export * from "./service";

/** OtpStore backed by the OtpRequest table. */
export const prismaOtpStore: OtpStore = {
  async invalidateActive(mobile, purpose, clientId) {
    await prisma.otpRequest.updateMany({
      where: { mobile, purpose, clientId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
  },
  async create(row) {
    await prisma.otpRequest.create({ data: row });
  },
  async findLatestActive(mobile, purpose, clientId) {
    return prisma.otpRequest.findFirst({
      where: { mobile, purpose, clientId, consumedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, codeHash: true, expiresAt: true, attempts: true },
    });
  },
  async incrementAttempts(id) {
    await prisma.otpRequest.update({ where: { id }, data: { attempts: { increment: 1 } } });
  },
  async consume(id) {
    await prisma.otpRequest.update({ where: { id }, data: { consumedAt: new Date() } });
  },
};

let service: OtpService | undefined;

/** Throws OTP_OFF while OTP login is switched off (features.ts). */
export function getOtpService(): OtpService {
  if (!OTP_LOGIN_ENABLED) throw new DomainError("OTP_OFF", OTP_OFF_MESSAGE);
  if (!service) {
    const env = getEnv();
    service = new OtpService(prismaOtpStore, createOtpProvider(env), env.SESSION_SECRET);
  }
  return service;
}
