// PM2 processes for a production server (docs/DEPLOYMENT.md).
//   pm2 start ecosystem.config.cjs && pm2 save
// Both read the repo's .env; NODE_ENV is set here, not in .env or the shell, so `pnpm install`
// still installs the build tools (TypeScript, tsx).
const path = require("node:path");

module.exports = {
  apps: [
    {
      name: "cataloglink-web",
      cwd: path.join(__dirname, "apps/web"),
      script: "node_modules/next/dist/bin/next",
      // Only Nginx talks to the app; port 3000 is not open to the internet.
      args: "start --port 3000 --hostname 127.0.0.1",
      env: { NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" },
      max_memory_restart: "1G",
      time: true,
    },
    {
      name: "cataloglink-worker",
      cwd: path.join(__dirname, "apps/worker"),
      script: "node_modules/tsx/dist/cli.mjs",
      args: "src/index.ts",
      env: { NODE_ENV: "production" },
      max_memory_restart: "700M",
      time: true,
    },
  ],
};
