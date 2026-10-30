import { resolve } from "node:path";
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Prisma 7 does not load .env automatically; the single .env lives at the repo root.
config({ path: resolve(import.meta.dirname, "../../.env"), quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Not needed by `prisma generate`, so a missing value only fails commands that connect.
    url: process.env.DATABASE_URL ?? "",
  },
});
