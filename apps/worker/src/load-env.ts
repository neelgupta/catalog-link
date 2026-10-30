// Imported first so the repo-root .env is loaded before any module reads process.env.
import { resolve } from "node:path";
import { config } from "dotenv";

const repoRoot = resolve(import.meta.dirname, "../../..");

config({ path: resolve(repoRoot, ".env"), quiet: true });
// Shared with the web app: relative paths in .env (key file, fixtures) resolve from the repo root.
process.env.REPO_ROOT ??= repoRoot;
process.env.MEDIA_DIR ??= resolve(repoRoot, "media");
if (process.env.GOOGLE_FAKE_DIR) process.env.GOOGLE_FAKE_DIR = resolve(repoRoot, process.env.GOOGLE_FAKE_DIR);
