/**
 * Seeds a fresh database with what the venue needs to open, without overwriting anything
 * the owner has already changed. Safe to run repeatedly.
 *
 *   npm run db:seed
 */
import "../scripts/load-env";

import type { Prisma, StaffRole } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { DEFAULT_SETTINGS, SETTINGS_KEYS } from "@/server/settings";
import { supabaseAdmin } from "@/server/supabase/admin";

const EXPERIENCES = [
  { code: "track", name: "Track / Drift", trackLabel: "Racing track", tagline: "Asphalt · Fast laps", sortOrder: 1 },
  { code: "offroad", name: "Off-road", trackLabel: "Off-road track", tagline: "Rough terrain · Technical driving", sortOrder: 2 },
];

const RIGS = ["Rig 1", "Rig 2", "Rig 3", "Rig 4"];

// The venue's fleet: 4 racing-track cars and 4 off-road cars. Rename, add or retire them in the owner console.
const SAMPLE_CARS = [
  { label: "T1", experience: "track" },
  { label: "T2", experience: "track" },
  { label: "T3", experience: "track" },
  { label: "T4", experience: "track" },
  { label: "O1", experience: "offroad" },
  { label: "O2", experience: "offroad" },
  { label: "O3", experience: "offroad" },
  { label: "O4", experience: "offroad" },
];

async function seedSettings() {
  const existing = new Set((await db.setting.findMany({ select: { key: true } })).map((s) => s.key));
  for (const key of SETTINGS_KEYS) {
    if (existing.has(key)) continue;
    await db.setting.create({ data: { key, value: DEFAULT_SETTINGS[key] as unknown as Prisma.InputJsonValue } });
    console.log(`  settings.${key}: created with defaults`);
  }
}

async function seedVenue() {
  for (const e of EXPERIENCES) {
    await db.experience.upsert({ where: { code: e.code }, create: e, update: {} });
  }
  for (const [i, label] of RIGS.entries()) {
    await db.rig.upsert({ where: { label }, create: { label, sortOrder: i + 1 }, update: {} });
  }
  const byCode = new Map((await db.experience.findMany()).map((e) => [e.code, e.id]));
  const existingCars = new Set((await db.car.findMany({ select: { label: true } })).map((c) => c.label));
  const missing = SAMPLE_CARS.filter((c) => !existingCars.has(c.label));
  if (missing.length) {
    await db.car.createMany({
      data: missing.map((c) => ({ label: c.label, experienceId: byCode.get(c.experience)!, notes: "Created by the seed script" })),
    });
    console.log(`  cars: created ${missing.map((c) => c.label).join(", ")}`);
  }
}

async function findAuthUserId(email: string): Promise<string | undefined> {
  const admin = supabaseAdmin();
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < 200) return undefined;
  }
}

async function seedTestStaff() {
  const password = process.env.SEED_TEST_PASSWORD;
  if (process.env.NODE_ENV === "production") {
    console.log("  test staff: skipped in production");
    return;
  }
  if (!password || password.length < 10) {
    console.log("  test staff: skipped (set SEED_TEST_PASSWORD, at least 10 characters, in .env.local)");
    return;
  }

  const accounts: { email?: string; name: string; role: StaffRole }[] = [
    { email: process.env.SEED_OWNER_EMAIL, name: "Test Owner", role: "OWNER" },
    { email: process.env.SEED_MANAGER_EMAIL, name: "Test Manager", role: "MANAGER" },
    { email: process.env.SEED_STAFF_EMAIL, name: "Test Staff", role: "STAFF" },
  ];

  const admin = supabaseAdmin();
  for (const a of accounts) {
    if (!a.email) continue;
    let id = await findAuthUserId(a.email);
    if (id) {
      const { error } = await admin.auth.admin.updateUserById(id, { password });
      if (error) throw error;
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: a.email,
        password,
        email_confirm: true,
        user_metadata: { name: a.name },
      });
      if (error) throw error;
      id = data.user.id;
    }
    await db.staffProfile.upsert({
      where: { id },
      create: { id, email: a.email, name: a.name, role: a.role },
      update: { role: a.role, active: true },
    });
    console.log(`  test staff: ${a.role.toLowerCase()} → ${a.email}`);
  }
}

async function main() {
  console.log("Seeding RS4V…");
  await seedSettings();
  await seedVenue();
  await seedTestStaff();
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
