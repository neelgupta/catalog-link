import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { testDatabaseUrl } from "../vitest.config";

/**
 * Brings the test database up to date before the DB test run. Non-destructive: it only applies
 * pending migrations, and each test creates uniquely named rows and deletes only what it created.
 */
export default function setup() {
  const url = testDatabaseUrl();
  if (!new URL(url).pathname.endsWith("_test")) {
    throw new Error(`Refusing to run DB tests against a database whose name does not end in _test: ${url}`);
  }
  const env = { ...process.env, DATABASE_URL: url };
  const cwd = resolve(import.meta.dirname, "..");
  try {
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], { cwd, env, stdio: "pipe" });
  } catch (err) {
    const out = err as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(`prisma migrate deploy failed:\n${out.stdout ?? ""}${out.stderr ?? ""}`);
  }
}
