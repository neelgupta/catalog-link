import { resolve } from "node:path";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

config({ path: resolve(import.meta.dirname, "../../.env"), quiet: true });

/** DB tests run against `<database>_test` so they never touch development data. */
export function testDatabaseUrl() {
  const base = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL is not set");
  if (process.env.TEST_DATABASE_URL) return base;
  const url = new URL(base);
  url.pathname = `${url.pathname.replace(/\/$/, "")}_test`;
  return url.toString();
}

const dbMode = process.env.VITEST_DB === "1";

export default defineConfig({
  test: dbMode
    ? {
        include: ["src/**/*.db.test.ts"],
        globalSetup: ["./test/db-setup.ts"],
        env: { DATABASE_URL: testDatabaseUrl() },
        fileParallelism: false,
      }
    : {
        include: ["src/**/*.test.ts"],
        exclude: ["src/**/*.db.test.ts"],
      },
});
