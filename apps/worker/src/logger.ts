import { pino } from "pino";

export const logger = pino({ name: "worker", level: process.env.LOG_LEVEL ?? "info" });
