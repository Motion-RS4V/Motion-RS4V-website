import type { BookingChannel, Prisma, PrismaClient } from "@/generated/prisma/client";
import { loadSettings, settingsSchemas, type Settings } from "@/server/settings";
import { checkFit, computeAvailability, countByExperience, type SlotAvailability } from "./capacity";
import { BookingError, type BookingErrorCode } from "./errors";
import { loadInventory, lockSlots } from "./inventory";
import { normalizePhone } from "./phone";
import {
  checkReschedule,
  isNoShowDue,
  quoteCancellation,
  snapshotPolicy,
  type Actor,
  type PolicySnapshot,
} from "./policy";
import { priceForSlot, quote } from "./pricing";
import { newBookingReference } from "./reference";
import { findSlot, generateSlots, hoursForDate, type OpeningHours, type Slot } from "./schedule";
import { addMinutes, dayOfWeek, isLocalDate, utcToLocal, type LocalDate, type LocalTime } from "./time";

type Db = PrismaClient;
type Tx = Prisma.TransactionClient;

// Generous limits: from a laptop every query is a round trip to Mumbai; on the server they finish in milliseconds.
const TX_OPTIONS = { maxWait: 15_000, timeout: 20_000 } as const;

const policySnapshotSchema = settingsSchemas.policy.pick({
  freeCancelHours: true,
  rescheduleCutoffMinutes: true,
  maxReschedules: true,
  noShowGraceMinutes: true,
});

function readPolicy(json: Prisma.JsonValue): PolicySnapshot {
  return policySnapshotSchema.parse(json);
}

function overrideFor(tx: Tx, date: LocalDate) {
  return tx.scheduleOverride.findUnique({
    where: { date: new Date(`${date}T00:00:00.000Z`) },
    select: { closed: true, opensAt: true, closesAt: true },
  });
}

// ───────────────────────────── Sale window ─────────────────────────────

type SaleBlocker = "PAST" | "ONLINE_CLOSED" | "OUTSIDE_WINDOW";

const BLOCKER_ERRORS: Record<SaleBlocker, BookingErrorCode> = {
  PAST: "SLOT_IN_PAST",
  ONLINE_CLOSED: "ONLINE_BOOKING_CLOSED",
  OUTSIDE_WINDOW: "OUTSIDE_BOOKING_WINDOW",
};

/**
 * Online: until `onlineCutoffMinutes` before the start, and no further ahead than the booking window.
 * Phone (staff): until the start. Walk-in (staff): until the slot ends, so seats freed by no-shows can still be sold;
 * the staff console shows how much drive time is left.
 */
function saleBlocker(slot: Slot, channel: BookingChannel, settings: Settings, now: Date): SaleBlocker | null {
  const { schedule } = settings;
  if (channel === "WALK_IN") return now >= slot.end ? "PAST" : null;
  if (now >= slot.start) return "PAST";
  if (channel === "PHONE") return null;
  if (now > addMinutes(slot.start, -schedule.onlineCutoffMinutes)) return "ONLINE_CLOSED";
  if (slot.start > addMinutes(now, schedule.bookingWindowDays * 24 * 60)) return "OUTSIDE_WINDOW";
  return null;
}

// ───────────────────────────── Availability ─────────────────────────────

export type SlotView = {
  start: Date;
  end: Date;
  localTime: LocalTime;
  unitPricePaise: number;
  priceRule: string | null;
  availability: SlotAvailability;
  bookable: boolean;
  unavailableReason: SaleBlocker | "FULL" | null;
};

export type DayAvailability = { date: LocalDate; hours: OpeningHours; slots: SlotView[] };

/** Every session on a venue-local date with live seat counts, as a customer (ONLINE) or staff member would see it. */
export async function getDayAvailability(
  db: Db,
  date: LocalDate,
  opts: { now?: Date; channel?: BookingChannel } = {},
): Promise<DayAvailability> {
  if (!isLocalDate(date)) throw new BookingError("SLOT_NOT_FOUND", { date });
  const now = opts.now ?? new Date();
  const channel = opts.channel ?? "ONLINE";

  const settings = await loadSettings(db);
  const tz = settings.venue.timezone;
  const hours = hoursForDate(settings.schedule, await overrideFor(db, date), date);
  const slots = generateSlots(date, hours, settings.schedule.slotMinutes, tz);
  const inventory = await loadInventory(db, slots, now);
  const day = dayOfWeek(date);

  return {
    date,
    hours,
    slots: slots.map((slot) => {
      const availability = computeAvailability(inventory.get(slot.start.getTime())!, settings.policy.limitSeatsByReadyCars);
      const price = priceForSlot(settings.pricing, day, slot.localTime);
      const unavailableReason = saleBlocker(slot, channel, settings, now) ?? (availability.total.available === 0 ? "FULL" : null);
      return {
        start: slot.start,
        end: slot.end,
        localTime: slot.localTime,
        unitPricePaise: price.unitPricePaise,
        priceRule: price.ruleLabel,
        availability,
        bookable: unavailableReason === null,
        unavailableReason,
      };
    }),
  };
}

// ───────────────────────────── Create ─────────────────────────────

export type CreateBookingInput = {
  slotStart: Date;
  seats: { experienceCode: string; driverName?: string | null }[];
  customer: { name: string; phone: string; email?: string | null; marketingConsent?: boolean };
  channel: BookingChannel;
  attribution?: {
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    referrer?: string | null;
    landingPath?: string | null;
    deviceType?: string | null;
  };
  staffId?: string | null; // set for walk-in and phone bookings
  termsAcceptedAt?: Date | null; // online checkout records when the customer accepted the booking terms
  now?: Date;
};

const bookingSummary = {
  id: true,
  reference: true,
  status: true,
  channel: true,
  slotStart: true,
  slotEnd: true,
  seatCount: true,
  unitPricePaise: true,
  totalPaise: true,
  holdExpiresAt: true,
  rescheduleCount: true,
  seats: { select: { id: true, status: true, driverName: true, experience: { select: { code: true, name: true } } } },
} satisfies Prisma.BookingSelect;

export type BookingSummary = Prisma.BookingGetPayload<{ select: typeof bookingSummary }>;

/**
 * Sells seats in one slot. Online bookings are held as PENDING_PAYMENT until paid or the hold runs out;
 * staff bookings (walk-in, phone) are confirmed straight away.
 * Price, availability and the sale window are all decided here, inside a slot lock. Nothing from the browser is trusted.
 */
export async function createBooking(db: Db, input: CreateBookingInput): Promise<BookingSummary> {
  const now = input.now ?? new Date();
  const phone = normalizePhone(input.customer.phone);
  if (!phone) throw new BookingError("INVALID_PHONE");
  const name = input.customer.name.trim();
  if (!name) throw new BookingError("MISSING_NAME");
  if (input.seats.length === 0) throw new BookingError("NO_SEATS");
  const email = input.customer.email?.trim() || null;
  const consent = input.customer.marketingConsent === true;

  return db.$transaction(async (tx) => {
    const settings = await loadSettings(tx);
    if (input.seats.length > settings.policy.maxSeatsPerBooking) {
      throw new BookingError("TOO_MANY_SEATS", { max: settings.policy.maxSeatsPerBooking });
    }

    const tz = settings.venue.timezone;
    const local = utcToLocal(input.slotStart, tz);
    const slot = findSlot(input.slotStart, settings.schedule, await overrideFor(tx, local.date), tz);
    if (!slot) throw new BookingError("SLOT_NOT_FOUND");
    const blocker = saleBlocker(slot, input.channel, settings, now);
    if (blocker) throw new BookingError(BLOCKER_ERRORS[blocker]);

    await lockSlots(tx, [slot.start]);

    const request = countByExperience(input.seats.map((s) => s.experienceCode));
    const inventory = (await loadInventory(tx, [slot], now)).get(slot.start.getTime())!;
    const fit = checkFit(computeAvailability(inventory, settings.policy.limitSeatsByReadyCars), request);
    if (!fit.ok) throw new BookingError(fit.code, fit);

    const experiences = await tx.experience.findMany({
      where: { code: { in: Object.keys(request) }, active: true },
      select: { id: true, code: true },
    });
    const experienceId = new Map(experiences.map((e) => [e.code, e.id]));

    const price = priceForSlot(settings.pricing, local.day, slot.localTime);
    const totals = quote(settings.pricing, price.unitPricePaise, input.seats.length);

    const customer = await tx.customer.upsert({
      where: { phone },
      create: { phone, name, email, marketingConsent: consent, marketingConsentAt: consent ? now : null },
      update: {
        name,
        ...(email ? { email } : {}),
        // Consent is only ever granted here; withdrawing it is a separate, explicit action.
        ...(consent ? { marketingConsent: true, marketingConsentAt: now } : {}),
      },
      select: { id: true },
    });

    const online = input.channel === "ONLINE";
    const booking = await tx.booking.create({
      data: {
        reference: await uniqueReference(tx),
        customerId: customer.id,
        channel: input.channel,
        status: online ? "PENDING_PAYMENT" : "CONFIRMED",
        slotStart: slot.start,
        slotEnd: slot.end,
        seatCount: input.seats.length,
        unitPricePaise: totals.unitPricePaise,
        subtotalPaise: totals.subtotalPaise,
        totalPaise: totals.totalPaise,
        policySnapshot: snapshotPolicy(settings.policy),
        holdExpiresAt: online ? addMinutes(now, settings.policy.paymentHoldMinutes) : null,
        confirmedAt: online ? null : now,
        ...input.attribution,
        contactEmail: email,
        termsAcceptedAt: input.termsAcceptedAt ?? null,
        createdById: input.staffId ?? null,
        seats: {
          create: input.seats.map((s) => ({
            experienceId: experienceId.get(s.experienceCode)!,
            driverName: s.driverName?.trim() || null,
          })),
        },
      },
      select: bookingSummary,
    });

    if (input.staffId) {
      await audit(tx, input.staffId, "booking.create", booking.id, undefined, {
        reference: booking.reference,
        channel: booking.channel,
        slotStart: booking.slotStart.toISOString(),
        seats: request,
      });
    }
    return booking;
  }, TX_OPTIONS);
}

async function uniqueReference(tx: Tx): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = newBookingReference();
    if (!(await tx.booking.findUnique({ where: { reference }, select: { id: true } }))) return reference;
  }
  throw new Error("Could not generate a unique booking reference");
}

// ───────────────────────────── Payment ─────────────────────────────

export type ConfirmOutcome = "CONFIRMED" | "ALREADY_CONFIRMED" | "NO_LONGER_AVAILABLE" | "BOOKING_CANCELLED";

/**
 * Called once payment is captured. If the hold ran out first, the seats are re-checked: the booking is confirmed
 * if they're still free, otherwise it comes back NO_LONGER_AVAILABLE and the caller refunds the payment.
 */
export async function confirmHeldBooking(
  db: Db,
  input: { bookingId: string; now?: Date },
): Promise<{ outcome: ConfirmOutcome; booking: BookingSummary }> {
  const now = input.now ?? new Date();
  return db.$transaction(async (tx) => {
    const found = await tx.booking.findUnique({ where: { id: input.bookingId }, select: { slotStart: true } });
    if (!found) throw new BookingError("BOOKING_NOT_FOUND");
    await lockSlots(tx, [found.slotStart]);

    const booking = await tx.booking.findUniqueOrThrow({ where: { id: input.bookingId }, select: bookingSummary });
    if (["CONFIRMED", "CHECKED_IN", "COMPLETED"].includes(booking.status)) return { outcome: "ALREADY_CONFIRMED", booking };
    if (booking.status === "CANCELLED" || booking.status === "NO_SHOW") return { outcome: "BOOKING_CANCELLED", booking };

    const holdLive = booking.status === "PENDING_PAYMENT" && booking.holdExpiresAt !== null && booking.holdExpiresAt > now;
    if (!holdLive) {
      const settings = await loadSettings(tx);
      const inventory = (
        await loadInventory(tx, [{ start: booking.slotStart, end: booking.slotEnd }], now, { excludeBookingId: booking.id })
      ).get(booking.slotStart.getTime())!;
      const request = countByExperience(booking.seats.map((s) => s.experience.code));
      if (!checkFit(computeAvailability(inventory, settings.policy.limitSeatsByReadyCars), request).ok) {
        const expired = await tx.booking.update({ where: { id: booking.id }, data: { status: "EXPIRED" }, select: bookingSummary });
        return { outcome: "NO_LONGER_AVAILABLE", booking: expired };
      }
    }

    const confirmed = await tx.booking.update({
      where: { id: booking.id },
      data: { status: "CONFIRMED", confirmedAt: now, holdExpiresAt: null },
      select: bookingSummary,
    });
    return { outcome: "CONFIRMED", booking: confirmed };
  }, TX_OPTIONS);
}

// ───────────────────────────── Cancel ─────────────────────────────

export type CancelResult = {
  bookingStatus: BookingSummary["status"];
  cancelledSeatIds: string[];
  refundDuePaise: number; // the caller issues this refund through the payment provider or at the counter
  refundReason: string;
};

export async function cancelBooking(
  db: Db,
  input: { bookingId: string; seatIds?: string[]; actor: Actor; reason?: string; now?: Date },
): Promise<CancelResult> {
  const now = input.now ?? new Date();
  return db.$transaction(async (tx) => {
    const found = await tx.booking.findUnique({ where: { id: input.bookingId }, select: { slotStart: true } });
    if (!found) throw new BookingError("BOOKING_NOT_FOUND");
    await lockSlots(tx, [found.slotStart]);

    const booking = await tx.booking.findUniqueOrThrow({
      where: { id: input.bookingId },
      include: {
        seats: { select: { id: true, status: true } },
        payments: { select: { status: true, amountPaise: true, refunds: { select: { status: true, amountPaise: true } } } },
      },
    });

    const active = booking.seats.filter((s) => s.status === "BOOKED");
    const targets = input.seatIds ? active.filter((s) => input.seatIds!.includes(s.id)) : active;
    if (targets.length === 0 || (input.seatIds && targets.length !== input.seatIds.length)) {
      throw new BookingError("INVALID_STATE", { status: booking.status });
    }

    let refundDuePaise = 0;
    let refundReason = "UNPAID";
    if (booking.status === "CONFIRMED") {
      const q = quoteCancellation({
        slotStart: booking.slotStart,
        policy: readPolicy(booking.policySnapshot),
        netPaidPaise: netPaid(booking.payments),
        activeSeats: active.length,
        seatsToCancel: targets.length,
        actor: input.actor,
        now,
      });
      if (!q.allowed) throw new BookingError("CANCEL_NOT_ALLOWED", { reason: q.reason });
      refundDuePaise = q.refundPaise;
      refundReason = q.reason;
    } else if (booking.status !== "PENDING_PAYMENT") {
      throw new BookingError("INVALID_STATE", { status: booking.status });
    }

    const targetIds = targets.map((s) => s.id);
    await tx.bookingSeat.updateMany({ where: { id: { in: targetIds } }, data: { status: "CANCELLED" } });
    const allGone = targets.length === active.length;
    const updated = await tx.booking.update({
      where: { id: booking.id },
      data: allGone ? { status: "CANCELLED", cancelledAt: now, cancelReason: input.reason ?? null, holdExpiresAt: null } : {},
      select: { status: true },
    });

    await audit(tx, actorId(input.actor), allGone ? "booking.cancel" : "booking.cancel_seats", booking.id, undefined, {
      seats: targetIds,
      refundDuePaise,
      refundReason,
      by: input.actor.kind,
      reason: input.reason ?? null,
    });

    return { bookingStatus: updated.status, cancelledSeatIds: targetIds, refundDuePaise, refundReason };
  }, TX_OPTIONS);
}

/**
 * What cancelling would do right now, without changing anything. Used to show the refund before the customer confirms.
 * The real cancellation re-checks everything inside its own transaction.
 */
export async function previewCancellation(
  db: Db,
  input: { bookingId: string; seatIds?: string[]; actor: Actor; now?: Date },
): Promise<{ allowed: boolean; refundPaise: number; reason: string; seatsToCancel: number; activeSeats: number }> {
  const now = input.now ?? new Date();
  const booking = await db.booking.findUnique({
    where: { id: input.bookingId },
    include: {
      seats: { select: { id: true, status: true } },
      payments: { select: { status: true, amountPaise: true, refunds: { select: { status: true, amountPaise: true } } } },
    },
  });
  if (!booking) throw new BookingError("BOOKING_NOT_FOUND");
  const active = booking.seats.filter((s) => s.status === "BOOKED");
  const targets = input.seatIds ? active.filter((s) => input.seatIds!.includes(s.id)) : active;
  const base = { seatsToCancel: targets.length, activeSeats: active.length };
  if (booking.status !== "CONFIRMED" || targets.length === 0 || (input.seatIds && targets.length !== input.seatIds.length)) {
    return { allowed: false, refundPaise: 0, reason: "NOT_CANCELLABLE", ...base };
  }
  const q = quoteCancellation({
    slotStart: booking.slotStart,
    policy: readPolicy(booking.policySnapshot),
    netPaidPaise: netPaid(booking.payments),
    activeSeats: active.length,
    seatsToCancel: targets.length,
    actor: input.actor,
    now,
  });
  return q.allowed ? { allowed: true, refundPaise: q.refundPaise, reason: q.reason, ...base } : { allowed: false, refundPaise: 0, reason: q.reason, ...base };
}

/** Whether the customer could move this booking right now, and why not. */
export async function previewReschedule(db: Db, input: { bookingId: string; actor: Actor; now?: Date }) {
  const now = input.now ?? new Date();
  const booking = await db.booking.findUnique({ where: { id: input.bookingId }, select: { status: true, slotStart: true, rescheduleCount: true, policySnapshot: true } });
  if (!booking) throw new BookingError("BOOKING_NOT_FOUND");
  if (booking.status !== "CONFIRMED") return { allowed: false as const, reason: "NOT_CONFIRMED" };
  return checkReschedule({ slotStart: booking.slotStart, policy: readPolicy(booking.policySnapshot), rescheduleCount: booking.rescheduleCount, actor: input.actor, now });
}

function netPaid(payments: { status: string; amountPaise: number; refunds: { status: string; amountPaise: number }[] }[]) {
  let total = 0;
  for (const p of payments) {
    if (!["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(p.status)) continue;
    total += p.amountPaise;
    for (const r of p.refunds) if (r.status !== "FAILED") total -= r.amountPaise;
  }
  return Math.max(0, total);
}

// ───────────────────────────── Reschedule ─────────────────────────────

/** Moves every remaining seat to another slot. The price paid stays as it was. */
export async function rescheduleBooking(
  db: Db,
  input: { bookingId: string; newSlotStart: Date; actor: Actor; now?: Date },
): Promise<BookingSummary> {
  const now = input.now ?? new Date();
  return db.$transaction(async (tx) => {
    const found = await tx.booking.findUnique({ where: { id: input.bookingId }, select: { slotStart: true } });
    if (!found) throw new BookingError("BOOKING_NOT_FOUND");
    await lockSlots(tx, [found.slotStart, input.newSlotStart]);

    const booking = await tx.booking.findUniqueOrThrow({
      where: { id: input.bookingId },
      include: { seats: { where: { status: "BOOKED" }, select: { experience: { select: { code: true } } } } },
    });
    if (booking.status !== "CONFIRMED" || booking.seats.length === 0) {
      throw new BookingError("INVALID_STATE", { status: booking.status });
    }

    const check = checkReschedule({
      slotStart: booking.slotStart,
      policy: readPolicy(booking.policySnapshot),
      rescheduleCount: booking.rescheduleCount,
      actor: input.actor,
      now,
    });
    if (!check.allowed) throw new BookingError("RESCHEDULE_NOT_ALLOWED", { reason: check.reason });

    const settings = await loadSettings(tx);
    const tz = settings.venue.timezone;
    const slot = findSlot(input.newSlotStart, settings.schedule, await overrideFor(tx, utcToLocal(input.newSlotStart, tz).date), tz);
    if (!slot) throw new BookingError("SLOT_NOT_FOUND");
    if (slot.start.getTime() === booking.slotStart.getTime()) throw new BookingError("INVALID_STATE", { reason: "SAME_SLOT" });
    const blocker = saleBlocker(slot, input.actor.kind === "customer" ? "ONLINE" : "PHONE", settings, now);
    if (blocker) throw new BookingError(BLOCKER_ERRORS[blocker]);

    const inventory = (await loadInventory(tx, [slot], now, { excludeBookingId: booking.id })).get(slot.start.getTime())!;
    const fit = checkFit(
      computeAvailability(inventory, settings.policy.limitSeatsByReadyCars),
      countByExperience(booking.seats.map((s) => s.experience.code)),
    );
    if (!fit.ok) throw new BookingError(fit.code, fit);

    const moved = await tx.booking.update({
      where: { id: booking.id },
      data: {
        slotStart: slot.start,
        slotEnd: slot.end,
        rescheduleCount: check.countsTowardLimit ? { increment: 1 } : undefined,
      },
      select: bookingSummary,
    });
    await tx.bookingSeat.updateMany({ where: { bookingId: booking.id, status: "BOOKED" }, data: { rigId: null, carId: null } });

    await audit(
      tx,
      actorId(input.actor),
      "booking.reschedule",
      booking.id,
      { slotStart: booking.slotStart.toISOString() },
      { slotStart: slot.start.toISOString(), by: input.actor.kind },
    );
    return moved;
  }, TX_OPTIONS);
}

// ───────────────────────────── Scheduled jobs ─────────────────────────────

/** Marks sessions that have finished as complete, so the board and customer history stay tidy. */
export async function completeFinishedSessions(db: Db, now: Date = new Date()): Promise<number> {
  const finished = await db.booking.findMany({
    where: { status: "CHECKED_IN", slotEnd: { lte: now } },
    select: { id: true },
    take: 200,
  });
  if (finished.length === 0) return 0;
  const ids = finished.map((b) => b.id);
  await db.bookingSeat.updateMany({ where: { bookingId: { in: ids }, status: "CHECKED_IN" }, data: { status: "COMPLETED" } });
  const { count } = await db.booking.updateMany({ where: { id: { in: ids } }, data: { status: "COMPLETED", completedAt: now } });
  return count;
}

/** Releases seats from unpaid online holds. Capacity already ignores expired holds; this tidies their status. */
export async function expireHolds(db: Db, now: Date = new Date()): Promise<number> {
  const { count } = await db.booking.updateMany({
    where: { status: "PENDING_PAYMENT", holdExpiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });
  return count;
}

/**
 * Marks seats nobody turned up for once the grace period has passed, freeing them for walk-ins.
 * A booking becomes NO_SHOW only if none of its drivers checked in.
 */
export async function markNoShows(db: Db, now: Date = new Date()): Promise<number> {
  const candidates = await db.booking.findMany({
    where: {
      status: { in: ["CONFIRMED", "CHECKED_IN"] },
      slotStart: { lte: now, gte: addMinutes(now, -24 * 60) },
      seats: { some: { status: "BOOKED" } },
    },
    select: { id: true, status: true, slotStart: true, policySnapshot: true },
  });

  let marked = 0;
  for (const b of candidates) {
    if (!isNoShowDue(b.slotStart, readPolicy(b.policySnapshot), now)) continue;
    await db.$transaction(async (tx) => {
      const { count } = await tx.bookingSeat.updateMany({ where: { bookingId: b.id, status: "BOOKED" }, data: { status: "NO_SHOW" } });
      if (count === 0) return;
      if (b.status === "CONFIRMED") {
        await tx.booking.update({ where: { id: b.id }, data: { status: "NO_SHOW", noShowAt: now } });
      }
      await audit(tx, null, "booking.no_show", b.id, undefined, { seats: count });
      marked += count;
    }, TX_OPTIONS);
  }
  return marked;
}

// ───────────────────────────── Helpers ─────────────────────────────

function actorId(actor: Actor): string | null {
  return actor.kind === "customer" ? null : actor.staffId;
}

async function audit(
  tx: Tx,
  actor: string | null,
  action: string,
  bookingId: string,
  before: Prisma.InputJsonValue | undefined,
  after: Prisma.InputJsonValue,
) {
  await tx.auditLog.create({ data: { actorId: actor, action, entityType: "booking", entityId: bookingId, before, after } });
}
