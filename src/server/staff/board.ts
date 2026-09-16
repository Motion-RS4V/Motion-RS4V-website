import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { normalizePhone, normalizeReference, previewCancellation, sessionLabels, utcToLocal, type LocalDate } from "@/server/booking";
import { generateSlots, hoursForDate } from "@/server/booking/schedule";
import { loadSettings } from "@/server/settings";

const ACTIVE_BOOKINGS = ["CONFIRMED", "CHECKED_IN", "COMPLETED", "NO_SHOW"] as const;

export type BoardSeat = {
  id: string;
  driverName: string | null;
  status: string;
  experience: string;
  experienceCode: string;
  track: string;
  rig: string | null;
  car: string | null;
};

export type BoardBooking = {
  id: string;
  reference: string;
  customerName: string;
  phone: string;
  channel: string;
  status: string;
  seats: BoardSeat[];
  paidPaise: number;
  totalPaise: number;
  duePaise: number;
};

export type BoardSlot = {
  start: string;
  localTime: string;
  state: "past" | "live" | "next" | "upcoming";
  capacity: number;
  sold: number;
  checkedIn: number;
  blocked: boolean;
  blockReasons: string[];
  bookings: BoardBooking[];
};

export type Board = {
  date: LocalDate;
  dateLabel: string;
  hours: { opensAt: string; closesAt: string } | null;
  timezone: string;
  slotMinutes: number;
  nowLocalTime: string;
  slots: BoardSlot[];
  totals: { sold: number; checkedIn: number; capacity: number };
};

/** Everything the desk needs for one day: sessions, who's booked, who's checked in, what's blocked. */
export async function getDayBoard(db: PrismaClient, date: LocalDate, opts: { now?: Date } = {}): Promise<Board> {
  const now = opts.now ?? new Date();
  const settings = await loadSettings(db);
  const tz = settings.venue.timezone;

  const override = await db.scheduleOverride.findUnique({
    where: { date: new Date(`${date}T00:00:00.000Z`) },
    select: { closed: true, opensAt: true, closesAt: true },
  });
  const hours = hoursForDate(settings.schedule, override, date);
  const slots = generateSlots(date, hours, settings.schedule.slotMinutes, tz);

  const dayStart = slots[0]?.start ?? new Date(`${date}T00:00:00.000Z`);
  const dayEnd = slots.at(-1)?.end ?? new Date(`${date}T23:59:59.000Z`);

  const [bookings, blocks, activeRigs] = await Promise.all([
    db.booking.findMany({
      where: { slotStart: { gte: dayStart, lte: dayEnd }, status: { in: [...ACTIVE_BOOKINGS] } },
      orderBy: [{ slotStart: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        reference: true,
        channel: true,
        status: true,
        slotStart: true,
        totalPaise: true,
        customer: { select: { name: true, phone: true } },
        payments: { select: { status: true, amountPaise: true, refunds: { select: { status: true, amountPaise: true } } } },
        seats: {
          orderBy: [{ experience: { sortOrder: "asc" } }, { id: "asc" }],
          select: {
            id: true,
            driverName: true,
            status: true,
            experience: { select: { code: true, name: true, trackLabel: true } },
            rig: { select: { label: true } },
            car: { select: { label: true } },
          },
        },
      },
    }),
    db.slotBlock.findMany({
      where: { liftedAt: null, startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } },
      select: { startsAt: true, endsAt: true, reason: true, rig: { select: { label: true } } },
    }),
    db.rig.count({ where: { status: "ACTIVE" } }),
  ]);

  const nowLocal = utcToLocal(now, tz);
  const boardSlots: BoardSlot[] = slots.map((slot) => {
    const inSlot = bookings.filter((b) => b.slotStart.getTime() === slot.start.getTime());
    const overlapping = blocks.filter((b) => b.startsAt < slot.end && b.endsAt > slot.start);
    const blockedRigs = new Set(overlapping.map((b) => b.rig?.label).filter(Boolean) as string[]);
    const venueBlocked = overlapping.some((b) => !b.rig);

    const seats = inSlot.flatMap((b) => b.seats);
    const sold = seats.filter((s) => s.status === "BOOKED" || s.status === "CHECKED_IN" || s.status === "COMPLETED").length;
    const checkedIn = seats.filter((s) => s.status === "CHECKED_IN" || s.status === "COMPLETED").length;

    return {
      start: slot.start.toISOString(),
      localTime: slot.localTime,
      state: slot.end <= now ? "past" : slot.start <= now ? "live" : "upcoming",
      capacity: venueBlocked ? 0 : Math.max(0, activeRigs - blockedRigs.size),
      sold,
      checkedIn,
      blocked: venueBlocked || blockedRigs.size > 0,
      blockReasons: overlapping.map((b) => `${b.rig ? b.rig.label : "Whole venue"}: ${b.reason}`),
      bookings: inSlot.map((b) => {
        const paidPaise = b.payments
          .filter((p) => ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(p.status))
          .reduce((sum, p) => sum + p.amountPaise - p.refunds.filter((r) => r.status !== "FAILED").reduce((s, r) => s + r.amountPaise, 0), 0);
        return {
          id: b.id,
          reference: b.reference,
          customerName: b.customer.name,
          phone: b.customer.phone,
          channel: b.channel,
          status: b.status,
          paidPaise,
          totalPaise: b.totalPaise,
          duePaise: Math.max(0, b.totalPaise - paidPaise),
          seats: b.seats.map((s) => ({
            id: s.id,
            driverName: s.driverName,
            status: s.status,
            experience: s.experience.name,
            experienceCode: s.experience.code,
            track: s.experience.trackLabel,
            rig: s.rig?.label ?? null,
            car: s.car?.label ?? null,
          })),
        };
      }),
    };
  });

  const firstUpcoming = boardSlots.find((s) => s.state === "upcoming");
  if (firstUpcoming) firstUpcoming.state = "next";

  return {
    date,
    dateLabel: slots[0] ? sessionLabels(slots[0].start, slots[0].end, tz).dateLabel : date,
    hours,
    timezone: tz,
    slotMinutes: settings.schedule.slotMinutes,
    nowLocalTime: nowLocal.date === date ? nowLocal.time : "",
    slots: boardSlots,
    totals: {
      sold: boardSlots.reduce((sum, s) => sum + s.sold, 0),
      checkedIn: boardSlots.reduce((sum, s) => sum + s.checkedIn, 0),
      capacity: boardSlots.reduce((sum, s) => sum + s.capacity, 0),
    },
  };
}

/**
 * Which bookings the desk means when it searches a name. Anything still to happen, or happening now,
 * comes first; finished sessions stay findable underneath, and cancelled ones sit last. A regular
 * customer can have a week of history, and it must never bury the booking they're standing there for.
 */
const SEARCH_GRACE_MS = 60 * 60_000;

function searchRank(status: string, slotStart: Date, now: Date) {
  if (status === "CANCELLED" || status === "EXPIRED") return 2;
  if (status === "COMPLETED" || status === "NO_SHOW") return 1;
  // CHECKED_IN, CONFIRMED and PENDING_PAYMENT: live while the session hasn't long passed.
  return slotStart.getTime() >= now.getTime() - SEARCH_GRACE_MS ? 0 : 1;
}

/** Desk search: booking reference, mobile number or name. */
export async function searchBookings(db: PrismaClient, query: string, now = new Date()) {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];
  const phone = normalizePhone(trimmed);
  const reference = /^[A-Za-z0-9-]{4,12}$/.test(trimmed) ? normalizeReference(trimmed) : null;

  const bookings = await db.booking.findMany({
    where: {
      OR: [
        ...(reference ? [{ reference }] : []),
        ...(phone ? [{ customer: { phone } }] : []),
        { customer: { name: { contains: trimmed, mode: "insensitive" as const } } },
      ],
      slotStart: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60_000) },
    },
    orderBy: { slotStart: "asc" },
    take: 40,
    select: {
      id: true,
      reference: true,
      status: true,
      slotStart: true,
      seatCount: true,
      channel: true,
      customer: { select: { name: true, phone: true } },
    },
  });

  const settings = await loadSettings(db);
  return bookings
    .map((b) => ({ ...b, rank: searchRank(b.status, b.slotStart, now) }))
    .sort((a, b) =>
      // Live bookings soonest first; everything finished or void, most recent first.
      a.rank !== b.rank ? a.rank - b.rank : a.rank === 0 ? +a.slotStart - +b.slotStart : +b.slotStart - +a.slotStart,
    )
    .slice(0, 20)
    .map((b) => ({
      id: b.id,
      reference: b.reference,
      status: b.status,
      channel: b.channel,
      seatCount: b.seatCount,
      name: b.customer.name,
      phone: b.customer.phone,
      live: b.rank === 0,
      ...sessionLabels(b.slotStart, new Date(b.slotStart.getTime() + settings.schedule.slotMinutes * 60_000), settings.venue.timezone),
    }));
}

export type StaffBooking = Awaited<ReturnType<typeof getStaffBooking>>;

/** Full detail for the desk: who, when, what they paid, and what each driver is assigned. */
export async function getStaffBooking(db: PrismaClient, id: string) {
  const settings = await loadSettings(db);
  const b = await db.booking.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      reference: true,
      status: true,
      channel: true,
      slotStart: true,
      slotEnd: true,
      totalPaise: true,
      unitPricePaise: true,
      contactEmail: true,
      checkedInAt: true,
      customer: { select: { name: true, phone: true, email: true } },
      createdBy: { select: { name: true } },
      seats: {
        orderBy: [{ experience: { sortOrder: "asc" } }, { id: "asc" }],
        select: {
          id: true,
          driverName: true,
          status: true,
          checkedInAt: true,
          experience: { select: { code: true, name: true, trackLabel: true } },
          rig: { select: { id: true, label: true } },
          car: { select: { id: true, label: true } },
        },
      },
      payments: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          method: true,
          status: true,
          amountPaise: true,
          capturedAt: true,
          refunds: { orderBy: { createdAt: "asc" }, select: { id: true, amountPaise: true, status: true, reason: true, processedAt: true } },
        },
      },
    },
  });

  const paidPaise = b.payments
    .filter((p) => ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(p.status))
    .reduce((sum, p) => sum + p.amountPaise, 0);
  const refundedPaise = b.payments.flatMap((p) => p.refunds).filter((r) => r.status !== "FAILED").reduce((sum, r) => sum + r.amountPaise, 0);

  // Refunds needing a human: cash to hand back at the desk, or an online refund the provider rejected.
  const outstandingRefunds = b.payments.flatMap((p) =>
    p.refunds
      .filter((r) => (r.status === "PENDING" && p.method !== "RAZORPAY") || r.status === "FAILED")
      .map((r) => ({ id: r.id, amountPaise: r.amountPaise, status: r.status, method: p.method, kind: p.method === "RAZORPAY" ? ("ONLINE" as const) : ("COUNTER" as const) })),
  );

  // Both answers to "why is this being cancelled?", so the desk sees the refund before choosing.
  const [customerQuote, venueQuote] = await Promise.all([
    previewCancellation(db, { bookingId: id, actor: { kind: "staff", staffId: "preview" } }).catch(() => null),
    previewCancellation(db, { bookingId: id, actor: { kind: "venue", staffId: null } }).catch(() => null),
  ]);

  const [rigs, cars] = await Promise.all([
    db.rig.findMany({ where: { status: { not: "RETIRED" } }, orderBy: { sortOrder: "asc" }, select: { id: true, label: true, status: true } }),
    db.car.findMany({ where: { status: { not: "RETIRED" } }, orderBy: { label: "asc" }, select: { id: true, label: true, status: true, experience: { select: { code: true } } } }),
  ]);

  return {
    ...b,
    slotStartIso: b.slotStart.toISOString(),
    ...sessionLabels(b.slotStart, b.slotEnd, settings.venue.timezone),
    paidPaise,
    refundedPaise,
    outstandingRefunds,
    duePaise: Math.max(0, b.totalPaise - (paidPaise - refundedPaise)),
    rigs,
    cars,
    arriveEarlyMinutes: settings.schedule.arriveEarlyMinutes,
    freeCancelHours: settings.policy.freeCancelHours,
    venue: {
      timezone: settings.venue.timezone,
      bookingWindowDays: settings.schedule.bookingWindowDays,
      slotMinutes: settings.schedule.slotMinutes,
    },
    cancelQuotes: {
      customer: customerQuote ? { allowed: customerQuote.allowed, refundPaise: customerQuote.refundPaise, reason: customerQuote.reason } : null,
      venue: venueQuote ? { allowed: venueQuote.allowed, refundPaise: venueQuote.refundPaise, reason: venueQuote.reason } : null,
    },
  };
}

/** Sessions someone can still be sold a seat in today, for the walk-in screen. */
export async function sellableSlots(db: PrismaClient, date: LocalDate, now = new Date()) {
  const { getDayAvailability } = await import("@/server/booking");
  const day = await getDayAvailability(db, date, { now, channel: "WALK_IN" });
  return day.slots
    .filter((s) => s.bookable)
    .map((s) => ({
      start: s.start.toISOString(),
      localTime: s.localTime,
      seatsLeft: s.availability.total.available,
      byExperience: Object.fromEntries(Object.entries(s.availability.byExperience).map(([code, v]) => [code, v.available])),
      pricePaise: s.unitPricePaise,
    }));
}
