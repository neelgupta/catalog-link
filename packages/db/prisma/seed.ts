import { resolve } from "node:path";
import { hash } from "@node-rs/argon2";
import { config } from "dotenv";

config({ path: resolve(import.meta.dirname, "../../../.env"), quiet: true });

const { prisma } = await import("../src/index");

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env before seeding");
  }
  if (password.length < 8) throw new Error("SEED_ADMIN_PASSWORD must be at least 8 characters");

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      role: "SUPER_ADMIN",
      name: "Super Admin",
      passwordHash: await hash(password),
    },
  });
  console.log(`Super Admin: ${admin.email}`);

  const plan = await prisma.plan.upsert({
    where: { name: "Starter" },
    update: {},
    create: {
      name: "Starter",
      maxProducts: 1000,
      maxCustomLinks: 10,
      maxStaff: 0,
      maxOrdersPerMonth: 500,
      price: 0,
      durationDays: 365,
    },
  });
  console.log(`Default plan: ${plan.name}`);

  const settings: Record<string, unknown> = {
    "sync.defaultIntervalMin": 5,
    "catalog.newArrivalDays": 7,
  };
  for (const [key, value] of Object.entries(settings)) {
    await prisma.platformSetting.upsert({
      where: { key },
      update: {},
      create: { key, value: value as never },
    });
  }
  console.log(`Platform settings: ${Object.keys(settings).length}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
