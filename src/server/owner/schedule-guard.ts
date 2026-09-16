import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { SEAT_HOLDING_STATUSES } from "@/server/booking/inventory";
import type { ScheduleOverrideInput } from "@/server/booking/schedule";
import type { LocalDate } from "@/server/booking/time";
import type { Settings } from "@/server/settings";
import { ScheduleConflictError } from "./errors";
import { findStrandedBookings } from "./schedule-change";

export function overrideDateKey(date: Date): LocalDate {
  return date.toISOString().slice(0, 10);
}

export function overrideDateValue(date: LocalDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/**
 * Throws ScheduleConflictError if any live upcoming booking wouldn't sit on a slot once the change is applied.
 * `overrides` edits the stored date overrides: a value replaces that date's override, null removes it.
 */
export async function assertNoStrandedBookings(
  db: PrismaClient,
  input: {
    schedule: Settings["schedule"];
    timezone: string;
    now: Date;
    overrides?: Map<LocalDate, ScheduleOverrideInput>;
    /** Only look at bookings on these venue dates. */
    onlyDates?: LocalDate[];
  },
): Promise<void> {
  const { now } = input;
  const bookings = await db.booking.findMany({
    where: {
      slotEnd: { gt: now },
      OR: [{ status: { in: SEAT_HOLDING_STATUSES } }, { status: "PENDING_PAYMENT", holdExpiresAt: { gt: now } }],
    },
    orderBy: { slotStart: "asc" },
    select: { reference: true, slotStart: true },
  });
  if (bookings.length === 0) return;

  const rows = await db.scheduleOverride.findMany({
    where: { date: { gte: new Date(now.getTime() - 24 * 60 * 60_000) } },
    select: { date: true, closed: true, opensAt: true, closesAt: true },
  });
  const overrides = new Map<LocalDate, ScheduleOverrideInput>(rows.map((r) => [overrideDateKey(r.date), r]));
  for (const [date, value] of input.overrides ?? []) {
    if (value) overrides.set(date, value);
    else overrides.delete(date);
  }

  let stranded = findStrandedBookings(input.schedule, bookings, overrides, input.timezone);
  if (input.onlyDates) stranded = stranded.filter((s) => input.onlyDates!.includes(s.date));
  if (stranded.length > 0) throw new ScheduleConflictError(stranded);
}
