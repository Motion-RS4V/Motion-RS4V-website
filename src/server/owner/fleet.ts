import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { isUniqueViolation, OwnerError } from "./errors";

type Db = PrismaClient;

function cleanLabel(label: string): string {
  const value = label.trim().replace(/\s+/g, " ");
  if (!value) throw new OwnerError("Give it a name.");
  return value;
}

async function uniqueLabel<T>(kind: "rig" | "car", label: string, write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (isUniqueViolation(error)) throw new OwnerError(`There's already a ${kind} called ${label}.`, 409);
    throw error;
  }
}

async function audit(db: Db, actorId: string, action: string, entityType: string, entityId: string, after: Record<string, unknown>) {
  await db.auditLog.create({ data: { actorId, action, entityType, entityId, after: after as never } });
}

/** New rigs start Working, so they add a seat to every future session straight away. */
export async function createRig(db: Db, input: { label: string; notes?: string | null; actorId: string }) {
  const label = cleanLabel(input.label);
  const last = await db.rig.aggregate({ _max: { sortOrder: true } });
  const rig = await uniqueLabel("rig", label, () =>
    db.rig.create({
      data: { label, notes: input.notes?.trim() || null, sortOrder: (last._max.sortOrder ?? 0) + 1 },
      select: { id: true, label: true, status: true },
    }),
  );
  await audit(db, input.actorId, "rig.create", "rig", rig.id, rig);
  return rig;
}

export async function updateRig(db: Db, input: { rigId: string; label: string; notes?: string | null; actorId: string }) {
  const label = cleanLabel(input.label);
  const rig = await uniqueLabel("rig", label, () =>
    db.rig.update({ where: { id: input.rigId }, data: { label, notes: input.notes?.trim() || null }, select: { id: true, label: true, notes: true } }),
  );
  await audit(db, input.actorId, "rig.update", "rig", rig.id, rig);
  return rig;
}

/** Swaps a rig with its neighbour in the list. The order is what staff see and how check-in picks rigs on a tie. */
export async function moveRig(db: Db, input: { rigId: string; direction: "up" | "down"; actorId: string }) {
  const rigs = await db.rig.findMany({ orderBy: [{ sortOrder: "asc" }, { label: "asc" }], select: { id: true } });
  const from = rigs.findIndex((r) => r.id === input.rigId);
  const to = input.direction === "up" ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= rigs.length) return;
  [rigs[from], rigs[to]] = [rigs[to], rigs[from]];
  // Rewrite every position so duplicate sort orders from older data can't make the swap a no-op.
  await db.$transaction(rigs.map((r, i) => db.rig.update({ where: { id: r.id }, data: { sortOrder: i + 1 } })));
  await audit(db, input.actorId, "rig.reorder", "rig", input.rigId, { direction: input.direction });
}

/** New cars start Ready for their track. */
export async function createCar(db: Db, input: { label: string; experienceCode: string; notes?: string | null; actorId: string }) {
  const label = cleanLabel(input.label);
  const experience = await db.experience.findUnique({ where: { code: input.experienceCode }, select: { id: true } });
  if (!experience) throw new OwnerError("Pick which track the car is for.");
  const car = await uniqueLabel("car", label, () =>
    db.car.create({
      data: { label, experienceId: experience.id, notes: input.notes?.trim() || null },
      select: { id: true, label: true, status: true },
    }),
  );
  await audit(db, input.actorId, "car.create", "car", car.id, { ...car, experience: input.experienceCode });
  return car;
}

export async function updateCar(db: Db, input: { carId: string; label: string; notes?: string | null; actorId: string }) {
  const label = cleanLabel(input.label);
  const car = await uniqueLabel("car", label, () =>
    db.car.update({ where: { id: input.carId }, data: { label, notes: input.notes?.trim() || null }, select: { id: true, label: true, notes: true } }),
  );
  await audit(db, input.actorId, "car.update", "car", car.id, car);
  return car;
}
