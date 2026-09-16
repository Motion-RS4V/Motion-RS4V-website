import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { utcToLocal, type LocalDate } from "@/server/booking/time";
import { loadSettings } from "@/server/settings";
import { OwnerError } from "./errors";
import { assertNoStrandedBookings, overrideDateKey, overrideDateValue } from "./schedule-guard";

export type DateOverride = { date: LocalDate; closed: boolean; opensAt: string | null; closesAt: string | null; note: string | null };

export async function listOverrides(db: PrismaClient, fromDate: LocalDate): Promise<DateOverride[]> {
  const rows = await db.scheduleOverride.findMany({
    where: { date: { gte: overrideDateValue(fromDate) } },
    orderBy: { date: "asc" },
    select: { date: true, closed: true, opensAt: true, closesAt: true, note: true },
  });
  return rows.map((r) => ({ ...r, date: overrideDateKey(r.date) }));
}

/**
 * Closes a date or gives it its own hours. Replaces any override already on that date.
 * Refused if a live booking that day would no longer sit on a session.
 */
export async function saveOverride(
  db: PrismaClient,
  input: { date: LocalDate; closed: boolean; opensAt?: string | null; closesAt?: string | null; note?: string | null; actorId: string; now?: Date },
): Promise<DateOverride> {
  const now = input.now ?? new Date();
  const settings = await loadSettings(db);
  const today = utcToLocal(now, settings.venue.timezone).date;
  if (input.date < today) throw new OwnerError("That date has already passed.");

  const hours = input.closed ? { opensAt: null, closesAt: null } : { opensAt: input.opensAt ?? null, closesAt: input.closesAt ?? null };
  if (!input.closed && (!hours.opensAt || !hours.closesAt || hours.opensAt >= hours.closesAt)) {
    throw new OwnerError("Closing time must be after opening time.");
  }
  const value = { closed: input.closed, ...hours };

  await assertNoStrandedBookings(db, {
    schedule: settings.schedule,
    timezone: settings.venue.timezone,
    now,
    overrides: new Map([[input.date, value]]),
    onlyDates: [input.date],
  });

  const date = overrideDateValue(input.date);
  const before = await db.scheduleOverride.findUnique({ where: { date } });
  const data = { ...value, note: input.note?.trim() || null };
  const row = await db.scheduleOverride.upsert({ where: { date }, create: { date, ...data }, update: data });
  await db.auditLog.create({
    data: {
      actorId: input.actorId,
      action: "schedule.override_save",
      entityType: "schedule_override",
      entityId: input.date,
      before: before ? { closed: before.closed, opensAt: before.opensAt, closesAt: before.closesAt, note: before.note } : undefined,
      after: data,
    },
  });
  return { date: input.date, closed: row.closed, opensAt: row.opensAt, closesAt: row.closesAt, note: row.note };
}

/** Puts a date back on the weekly hours. Refused if that would strand a booking made under the special hours. */
export async function removeOverride(db: PrismaClient, input: { date: LocalDate; actorId: string; now?: Date }): Promise<void> {
  const now = input.now ?? new Date();
  const settings = await loadSettings(db);
  const date = overrideDateValue(input.date);
  const before = await db.scheduleOverride.findUnique({ where: { date } });
  if (!before) return;

  await assertNoStrandedBookings(db, {
    schedule: settings.schedule,
    timezone: settings.venue.timezone,
    now,
    overrides: new Map([[input.date, null]]),
    onlyDates: [input.date],
  });

  await db.scheduleOverride.delete({ where: { date } });
  await db.auditLog.create({
    data: {
      actorId: input.actorId,
      action: "schedule.override_remove",
      entityType: "schedule_override",
      entityId: input.date,
      before: { closed: before.closed, opensAt: before.opensAt, closesAt: before.closesAt, note: before.note },
    },
  });
}
