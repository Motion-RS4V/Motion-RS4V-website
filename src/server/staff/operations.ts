import "server-only";

import type { CarStatus, Prisma, PrismaClient, RigStatus } from "@/generated/prisma/client";
import { BookingError, createBooking } from "@/server/booking";
import { lockSlots } from "@/server/booking/inventory";
import { pickAssignments, type Assignment } from "./assignment";

type Db = PrismaClient;
type Tx = Prisma.TransactionClient;

const TX_OPTIONS = { maxWait: 15_000, timeout: 20_000 } as const;
const RECENT_USE_DAYS = 14;

async function audit(tx: Tx, actorId: string | null, action: string, entityType: string, entityId: string, after: Prisma.InputJsonValue) {
  await tx.auditLog.create({ data: { actorId, action, entityType, entityId, after } });
}

/** What's free in a session right now: rigs not blocked or taken, and Ready cars per track not already out. */
async function freeResources(tx: Tx, slotStart: Date, slotEnd: Date, ignoreSeatIds: string[] = []) {
  const takenSeats = await tx.bookingSeat.findMany({
    where: {
      id: { notIn: ignoreSeatIds.length ? ignoreSeatIds : undefined },
      status: { in: ["BOOKED", "CHECKED_IN", "COMPLETED"] },
      booking: { slotStart, status: { in: ["CONFIRMED", "CHECKED_IN", "COMPLETED"] } },
    },
    select: { rigId: true, carId: true },
  });
  const takenRigs = new Set(takenSeats.map((s) => s.rigId).filter(Boolean) as string[]);
  const takenCars = new Set(takenSeats.map((s) => s.carId).filter(Boolean) as string[]);

  const blocks = await tx.slotBlock.findMany({
    where: { liftedAt: null, startsAt: { lt: slotEnd }, endsAt: { gt: slotStart } },
    select: { rigId: true },
  });
  const venueBlocked = blocks.some((b) => b.rigId === null);
  for (const b of blocks) if (b.rigId) takenRigs.add(b.rigId);

  const rigs = await tx.rig.findMany({ where: { status: "ACTIVE" }, select: { id: true, label: true, sortOrder: true }, orderBy: { sortOrder: "asc" } });
  const cars = await tx.car.findMany({ where: { status: "READY" }, select: { id: true, label: true, experience: { select: { code: true } } } });

  const since = new Date(slotStart.getTime() - RECENT_USE_DAYS * 24 * 60 * 60_000);
  const uses = await tx.bookingSeat.groupBy({
    by: ["carId"],
    where: { carId: { not: null }, booking: { slotStart: { gte: since, lte: slotStart } } },
    _count: { _all: true },
  });
  const useCount = new Map(uses.map((u) => [u.carId, u._count._all]));

  const freeCarsByExperience: Record<string, { id: string; label: string; recentUses: number }[]> = {};
  for (const car of cars) {
    if (takenCars.has(car.id)) continue;
    (freeCarsByExperience[car.experience.code] ??= []).push({ id: car.id, label: car.label, recentUses: useCount.get(car.id) ?? 0 });
  }

  return {
    freeRigs: venueBlocked ? [] : rigs.filter((r) => !takenRigs.has(r.id)),
    freeCarsByExperience,
  };
}

export type CheckInResult = {
  bookingStatus: string;
  assignments: (Assignment & { rigLabel: string | null; carLabel: string | null; driverName: string | null })[];
};

/**
 * Checks drivers in and gives each one a rig and a car. Staff can override any pick by passing it in.
 * Runs inside the slot lock, so two tablets can't hand out the same car.
 */
export async function checkInBooking(
  db: Db,
  input: { bookingId: string; seatIds?: string[]; overrides?: { seatId: string; rigId?: string | null; carId?: string | null }[]; actorId: string; now?: Date },
): Promise<CheckInResult> {
  const now = input.now ?? new Date();
  return db.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: input.bookingId },
      select: {
        id: true,
        status: true,
        slotStart: true,
        slotEnd: true,
        seats: { select: { id: true, status: true, driverName: true, rigId: true, carId: true, experience: { select: { code: true } } } },
      },
    });
    if (!booking) throw new BookingError("BOOKING_NOT_FOUND");
    if (booking.status !== "CONFIRMED" && booking.status !== "CHECKED_IN") throw new BookingError("INVALID_STATE", { status: booking.status });

    await lockSlots(tx, [booking.slotStart]);

    const target = booking.seats.filter((s) => s.status === "BOOKED" && (!input.seatIds || input.seatIds.includes(s.id)));
    if (target.length === 0) throw new BookingError("INVALID_STATE", { reason: "NO_SEATS_TO_CHECK_IN" });

    const free = await freeResources(tx, booking.slotStart, booking.slotEnd, target.map((s) => s.id));
    const overrides = new Map((input.overrides ?? []).map((o) => [o.seatId, o]));
    const auto = pickAssignments({
      seats: target.map((s) => ({ seatId: s.id, experienceCode: s.experience.code })),
      freeRigs: free.freeRigs,
      freeCarsByExperience: free.freeCarsByExperience,
    });

    const chosen = auto.map((a) => {
      const override = overrides.get(a.seatId);
      return {
        ...a,
        rigId: override?.rigId !== undefined ? override.rigId : a.rigId,
        carId: override?.carId !== undefined ? override.carId : a.carId,
      };
    });

    // A staff override must still point at something free.
    const rigIds = chosen.map((c) => c.rigId).filter(Boolean) as string[];
    const carIds = chosen.map((c) => c.carId).filter(Boolean) as string[];
    if (new Set(rigIds).size !== rigIds.length || new Set(carIds).size !== carIds.length) {
      throw new BookingError("INVALID_STATE", { reason: "DUPLICATE_ASSIGNMENT" });
    }
    const allowedRigs = new Set(free.freeRigs.map((r) => r.id));
    const allowedCars = new Set(Object.values(free.freeCarsByExperience).flat().map((c) => c.id));
    for (const c of chosen) {
      if (c.rigId && !allowedRigs.has(c.rigId)) throw new BookingError("INVALID_STATE", { reason: "RIG_TAKEN" });
      if (c.carId && !allowedCars.has(c.carId)) throw new BookingError("INVALID_STATE", { reason: "CAR_TAKEN" });
    }

    for (const c of chosen) {
      await tx.bookingSeat.update({
        where: { id: c.seatId },
        data: { status: "CHECKED_IN", checkedInAt: now, rigId: c.rigId, carId: c.carId },
      });
    }
    const updated = await tx.booking.update({
      where: { id: booking.id },
      data: { status: "CHECKED_IN", checkedInAt: booking.status === "CHECKED_IN" ? undefined : now },
      select: { status: true },
    });

    const labels = await tx.bookingSeat.findMany({
      where: { id: { in: chosen.map((c) => c.seatId) } },
      select: { id: true, driverName: true, rig: { select: { label: true } }, car: { select: { label: true } } },
    });
    await audit(tx, input.actorId, "booking.check_in", "booking", booking.id, {
      seats: chosen.map((c) => ({ seatId: c.seatId, rigId: c.rigId, carId: c.carId })),
    });

    return {
      bookingStatus: updated.status,
      assignments: chosen.map((c) => {
        const l = labels.find((x) => x.id === c.seatId);
        return { ...c, rigLabel: l?.rig?.label ?? null, carLabel: l?.car?.label ?? null, driverName: l?.driverName ?? null };
      }),
    };
  }, TX_OPTIONS);
}

/** Swap one driver's rig or car (a car won't start, a rig plays up). */
export async function reassignSeat(
  db: Db,
  input: { seatId: string; rigId?: string | null; carId?: string | null; actorId: string },
): Promise<{ rigLabel: string | null; carLabel: string | null }> {
  return db.$transaction(async (tx) => {
    const seat = await tx.bookingSeat.findUnique({
      where: { id: input.seatId },
      select: { id: true, bookingId: true, booking: { select: { slotStart: true, slotEnd: true } } },
    });
    if (!seat) throw new BookingError("BOOKING_NOT_FOUND");
    await lockSlots(tx, [seat.booking.slotStart]);

    const free = await freeResources(tx, seat.booking.slotStart, seat.booking.slotEnd, [seat.id]);
    if (input.rigId && !free.freeRigs.some((r) => r.id === input.rigId)) throw new BookingError("INVALID_STATE", { reason: "RIG_TAKEN" });
    if (input.carId && !Object.values(free.freeCarsByExperience).flat().some((c) => c.id === input.carId)) {
      throw new BookingError("INVALID_STATE", { reason: "CAR_TAKEN" });
    }

    const updated = await tx.bookingSeat.update({
      where: { id: seat.id },
      data: { rigId: input.rigId === undefined ? undefined : input.rigId, carId: input.carId === undefined ? undefined : input.carId },
      select: { rig: { select: { label: true } }, car: { select: { label: true } } },
    });
    await audit(tx, input.actorId, "seat.reassign", "booking", seat.bookingId, { seatId: seat.id, rigId: input.rigId ?? null, carId: input.carId ?? null });
    return { rigLabel: updated.rig?.label ?? null, carLabel: updated.car?.label ?? null };
  }, TX_OPTIONS);
}

/** Staff marking a driver (or a whole booking) as not turned up, before the automatic sweep does. */
export async function markNoShow(db: Db, input: { bookingId: string; seatIds?: string[]; actorId: string; now?: Date }) {
  const now = input.now ?? new Date();
  return db.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: input.bookingId }, select: { id: true, status: true, seats: { select: { id: true, status: true } } } });
    if (!booking) throw new BookingError("BOOKING_NOT_FOUND");
    const target = booking.seats.filter((s) => s.status === "BOOKED" && (!input.seatIds || input.seatIds.includes(s.id)));
    if (target.length === 0) throw new BookingError("INVALID_STATE", { reason: "NO_SEATS" });

    await tx.bookingSeat.updateMany({ where: { id: { in: target.map((s) => s.id) } }, data: { status: "NO_SHOW" } });
    const stillActive = booking.seats.some((s) => s.status === "CHECKED_IN" || (s.status === "BOOKED" && !target.some((t) => t.id === s.id)));
    if (!stillActive) await tx.booking.update({ where: { id: booking.id }, data: { status: "NO_SHOW", noShowAt: now } });
    await audit(tx, input.actorId, "booking.no_show", "booking", booking.id, { seats: target.map((s) => s.id) });
    return { seats: target.length, bookingStatus: stillActive ? booking.status : "NO_SHOW" };
  }, TX_OPTIONS);
}

/** Sells a seat at the desk and records how it was paid. */
export async function createWalkIn(
  db: Db,
  input: {
    slotStart: Date;
    seats: { experienceCode: string; driverName?: string | null }[];
    customer: { name: string; phone: string; email?: string | null };
    payment: { method: "CASH" | "UPI_COUNTER" | "CARD_COUNTER" | "COMPLIMENTARY" };
    actorId: string;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const booking = await createBooking(db, {
    slotStart: input.slotStart,
    seats: input.seats,
    customer: input.customer,
    channel: "WALK_IN",
    staffId: input.actorId,
    now,
  });

  const amountPaise = input.payment.method === "COMPLIMENTARY" ? 0 : booking.totalPaise;
  await db.payment.create({
    data: {
      bookingId: booking.id,
      method: input.payment.method,
      status: "CAPTURED",
      amountPaise,
      recordedById: input.actorId,
      capturedAt: now,
    },
  });
  await db.auditLog.create({
    data: {
      actorId: input.actorId,
      action: "booking.walk_in",
      entityType: "booking",
      entityId: booking.id,
      after: { reference: booking.reference, method: input.payment.method, amountPaise },
    },
  });
  return booking;
}

export async function setCarStatus(db: Db, input: { carId: string; status: CarStatus; actorId: string }) {
  const car = await db.car.update({ where: { id: input.carId }, data: { status: input.status }, select: { label: true, status: true } });
  await db.auditLog.create({ data: { actorId: input.actorId, action: "car.status", entityType: "car", entityId: input.carId, after: { label: car.label, status: car.status } } });
  return car;
}

export async function setRigStatus(db: Db, input: { rigId: string; status: RigStatus; actorId: string }) {
  const rig = await db.rig.update({ where: { id: input.rigId }, data: { status: input.status }, select: { label: true, status: true } });
  await db.auditLog.create({ data: { actorId: input.actorId, action: "rig.status", entityType: "rig", entityId: input.rigId, after: { label: rig.label, status: rig.status } } });
  return rig;
}

/** Seats already sold inside a period, so staff see what a maintenance block would affect. */
export async function bookingsInRange(db: Db, startsAt: Date, endsAt: Date) {
  return db.booking.findMany({
    where: { status: { in: ["CONFIRMED", "CHECKED_IN"] }, slotStart: { lt: endsAt }, slotEnd: { gt: startsAt } },
    orderBy: { slotStart: "asc" },
    select: { id: true, reference: true, slotStart: true, seatCount: true, customer: { select: { name: true } } },
  });
}

export async function createBlock(db: Db, input: { startsAt: Date; endsAt: Date; rigId?: string | null; reason: string; actorId: string }) {
  if (input.endsAt <= input.startsAt) throw new BookingError("INVALID_STATE", { reason: "END_BEFORE_START" });
  const block = await db.slotBlock.create({
    data: { startsAt: input.startsAt, endsAt: input.endsAt, rigId: input.rigId ?? null, reason: input.reason, createdById: input.actorId },
    select: { id: true, startsAt: true, endsAt: true, rigId: true, reason: true },
  });
  await db.auditLog.create({ data: { actorId: input.actorId, action: "block.create", entityType: "slot_block", entityId: block.id, after: block as never } });
  return block;
}

export async function liftBlock(db: Db, input: { blockId: string; actorId: string }) {
  const block = await db.slotBlock.update({ where: { id: input.blockId }, data: { liftedAt: new Date() }, select: { id: true } });
  await db.auditLog.create({ data: { actorId: input.actorId, action: "block.lift", entityType: "slot_block", entityId: block.id, after: {} } });
  return block;
}
