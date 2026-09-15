import type { BookingStatus, Prisma, SeatStatus } from "@/generated/prisma/client";
import type { SlotInventory } from "./capacity";

type Tx = Prisma.TransactionClient;

/** Bookings whose seats are taken regardless of time. PENDING_PAYMENT counts only while its hold is live. */
export const SEAT_HOLDING_STATUSES: BookingStatus[] = ["CONFIRMED", "CHECKED_IN", "COMPLETED"];
/** Seat statuses that occupy a rig. NO_SHOW seats are released to walk-ins. */
export const SEAT_OCCUPYING_STATUSES: SeatStatus[] = ["BOOKED", "CHECKED_IN", "COMPLETED"];

type SlotRange = { start: Date; end: Date };

/**
 * Reads everything capacity depends on for a set of slots, in a handful of queries.
 * Call inside the booking transaction, after taking the slot lock, so the counts can't change underneath.
 */
export async function loadInventory(
  tx: Tx,
  slots: SlotRange[],
  now: Date,
  opts: { excludeBookingId?: string } = {},
): Promise<Map<number, SlotInventory>> {
  const result = new Map<number, SlotInventory>();
  if (slots.length === 0) return result;

  const rangeStart = new Date(Math.min(...slots.map((s) => s.start.getTime())));
  const rangeEnd = new Date(Math.max(...slots.map((s) => s.end.getTime())));

  const activeRigs = await tx.rig.count({ where: { status: "ACTIVE" } });

  const blocks = await tx.slotBlock.findMany({
    where: { liftedAt: null, startsAt: { lt: rangeEnd }, endsAt: { gt: rangeStart } },
    select: { startsAt: true, endsAt: true, rigId: true, rig: { select: { status: true } } },
  });

  const experiences = await tx.experience.findMany({ where: { active: true }, select: { id: true, code: true } });
  const carGroups = await tx.car.groupBy({ by: ["experienceId"], where: { status: "READY" }, _count: { _all: true } });
  const readyCars: Record<string, number> = {};
  for (const e of experiences) {
    readyCars[e.code] = carGroups.find((g) => g.experienceId === e.id)?._count._all ?? 0;
  }

  const seats = await tx.bookingSeat.findMany({
    where: {
      status: { in: SEAT_OCCUPYING_STATUSES },
      booking: {
        slotStart: { gte: rangeStart, lt: rangeEnd },
        ...(opts.excludeBookingId ? { id: { not: opts.excludeBookingId } } : {}),
        OR: [{ status: { in: SEAT_HOLDING_STATUSES } }, { status: "PENDING_PAYMENT", holdExpiresAt: { gt: now } }],
      },
    },
    select: { experience: { select: { code: true } }, booking: { select: { slotStart: true } } },
  });

  for (const slot of slots) {
    const overlapping = blocks.filter((b) => b.startsAt < slot.end && b.endsAt > slot.start);
    const blockedRigIds = new Set(
      overlapping.filter((b) => b.rigId && b.rig?.status === "ACTIVE").map((b) => b.rigId as string),
    );
    const bookedSeats: Record<string, number> = {};
    for (const seat of seats) {
      if (seat.booking.slotStart.getTime() !== slot.start.getTime()) continue;
      bookedSeats[seat.experience.code] = (bookedSeats[seat.experience.code] ?? 0) + 1;
    }
    result.set(slot.start.getTime(), {
      activeRigs,
      blockedRigs: blockedRigIds.size,
      venueBlocked: overlapping.some((b) => b.rigId === null),
      readyCars,
      bookedSeats,
    });
  }
  return result;
}

/**
 * Serialises every booking change for the given slots until the transaction ends.
 * Locks are taken in a fixed order so a reschedule between two slots can't deadlock with another.
 */
export async function lockSlots(tx: Tx, starts: Date[]): Promise<void> {
  const keys = [...new Set(starts.map((d) => d.toISOString()))].sort();
  for (const key of keys) {
    await tx.$queryRaw`select 1 as locked from (select pg_advisory_xact_lock(hashtextextended(${`rs4v:slot:${key}`}, 0))) as l`;
  }
}
