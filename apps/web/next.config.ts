import { resolve } from "node:path";
import { config } from "dotenv";
import type { NextConfig } from "next";

const repoRoot = resolve(import.meta.dirname, "../..");

// One .env at the repo root is shared by web, worker and Prisma.
config({ path: resolve(repoRoot, ".env"), quiet: true });
// Shared with the worker: relative paths in .env (key file, fixtures) resolve from the repo root,
// and uploaded/generated files live in <repo>/media unless MEDIA_DIR says otherwise.
process.env.REPO_ROOT ??= repoRoot;
process.env.MEDIA_DIR ??= resolve(repoRoot, "media");
if (process.env.GOOGLE_FAKE_DIR) process.env.GOOGLE_FAKE_DIR = resolve(repoRoot, process.env.GOOGLE_FAKE_DIR);

const nextConfig: NextConfig = {
  transpilePackages: ["@cataloglink/core", "@cataloglink/db", "@cataloglink/validation"],
  serverExternalPackages: ["@node-rs/argon2", "bullmq", "ioredis", "pg", "@prisma/adapter-pg", "sharp", "exceljs", "google-auth-library", "@googleapis/sheets", "@googleapis/drive"],
  // Development only: let phones and other computers on the local network load the dev server's
  // scripts (Next.js only allows localhost by default). Ignored in production.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.16.*.*", "*.local"],
  turbopack: {
    root: repoRoot,
  },
  experimental: {
    // Uploads go through Server Actions: the profile form can carry a logo (2 MB), banner (5 MB) and
    // UPI QR (2 MB) at once; the sheet template is up to 5 MB.
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
