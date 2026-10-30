import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "vitest/config";
import { testDatabaseUrl } from "../db/vitest.config.ts";

const dbMode = process.env.VITEST_DB === "1";

export default defineConfig({
  test: dbMode
    ? {
        include: ["src/**/*.db.test.ts"],
        globalSetup: ["../db/test/db-setup.ts"],
        env: { DATABASE_URL: testDatabaseUrl(), MEDIA_DIR: join(tmpdir(), "cataloglink-test-media") },
        fileParallelism: false,
      }
    : {
        include: ["src/**/*.test.ts"],
        exclude: ["src/**/*.db.test.ts"],
      },
});
