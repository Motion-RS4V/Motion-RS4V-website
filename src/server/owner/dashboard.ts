import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import type { ScheduleOverrideInput } from "@/server/booking/schedule";
import { addDays, localToUtc, type LocalDate } from "@/server/booking/time";
import { loadSettings } from "@/server/settings";
import { change, daysInRange, summariseRevenue, summariseSeats, summariseSources, type Revenue, type Seats } from "./analytics";
import { overrideDateKey, overrideDateValue } from "./schedule-guard";

type Db = PrismaClient;

export type Kpi = { value: number; previous: number; change: number | null };

export type Dashboard = {
  from: LocalDate;
  to: LocalDate;
  previousFrom: LocalDate;
  previousTo: LocalDate;
  timezone: string;
  revenue: Revenue;
  seats: Seats;
  kpis: {
    netRevenuePaise: Kpi;
    seatsSold: Kpi;
    occupancy: Kpi;
    bookings: Kpi;
    averageGroup: Kpi;
    noShowRate: Kpi;
  };
  bookings: { total: number; cancelled: number; online: number; newCustomers: number; returningCustomers: number };
  sources: { source: string; bookings: number }[];
  experiences: Record<string, string>;
  rigs: number;
};

const LIVE_BOOKING = ["CONFIRMED", "CHECKED_IN", "COMPLETED", "NO_SHOW", "CANCELLED"] as const;

async function loadPeriod(db: Db, from: LocalDate, to: LocalDate, tz: string) {
  const start = localToUtc(from, "00:00", tz);
  const end = localToUtc(addDays(to, 1), "00:00", tz);
  const [payments, refunds, seats, bookings, overrides] = await Promise.all([
    db.payment.findMany({
      where: { status: { in: ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"] }, capturedAt: { gte: start, lt: end } },
      select: { method: true, amountPaise: true, capturedAt: true },
    }),
    db.refund.findMany({
      where: {
        OR: [
          // Online: counted when issued, whether Razorpay has finished paying it out or not.
          { status: { in: ["PENDING", "PROCESSED"] }, payment: { method: "RAZORPAY" }, createdAt: { gte: start, lt: end } },
          // Desk: counted when staff hand the money back.
          { status: "PROCESSED", payment: { method: { not: "RAZORPAY" } }, processedAt: { gte: start, lt: end } },
        ],
      },
      select: { amountPaise: true, status: true, createdAt: true, processedAt: true, payment: { select: { method: true } } },
    }),
    db.bookingSeat.findMany({
      where: { booking: { slotStart: { gte: start, lt: end }, status: { in: [...LIVE_BOOKING] } } },
      select: { status: true, experience: { select: { code: true } }, booking: { select: { channel: true, slotStart: true } } },
    }),
    db.booking.findMany({
      where: { slotStart: { gte: start, lt: end }, status: { in: [...LIVE_BOOKING] } },
      select: { status: true, channel: true, seatCount: true, customerId: true, utmSource: true, referrer: true },
    }),
    db.scheduleOverride.findMany({
      where: { date: { gte: overrideDateValue(from), lte: overrideDateValue(to) } },
      select: { date: true, closed: true, opensAt: true, closesAt: true },
    }),
  ]);
  return {
    start,
    payments: payments.filter((p) => p.capturedAt).map((p) => ({ method: p.method, amountPaise: p.amountPaise, capturedAt: p.capturedAt! })),
    refunds: refunds.map((r) => {
      const online = r.payment.method === "RAZORPAY";
      return { amountPaise: r.amountPaise, at: online ? r.createdAt : r.processedAt!, method: r.payment.method, pending: online && r.status === "PENDING" };
    }),
    seats: seats.map((s) => ({ status: s.status, experienceCode: s.experience.code, channel: s.booking.channel, slotStart: s.booking.slotStart })),
    bookings,
    overrides: new Map<LocalDate, ScheduleOverrideInput>(overrides.map((o) => [overrideDateKey(o.date), o])),
  };
}

/**
 * Everything the owner dashboard shows for a date range, with the same-length period before it for comparison.
 * Occupancy uses today's working rigs for every day in the range: the venue doesn't keep a history of rig counts.
 */
export async function getDashboard(db: Db, input: { from: LocalDate; to: LocalDate }): Promise<Dashboard> {
  const settings = await loadSettings(db);
  const tz = settings.venue.timezone;
  const length = daysInRange(input.from, input.to);
  const previousTo = addDays(input.from, -1);
  const previousFrom = addDays(previousTo, -(length - 1));

  const [current, previous, rigs, experiences] = await Promise.all([
    loadPeriod(db, input.from, input.to, tz),
    loadPeriod(db, previousFrom, previousTo, tz),
    db.rig.count({ where: { status: "ACTIVE" } }),
    db.experience.findMany({ select: { code: true, name: true } }),
  ]);

  const summarise = (period: typeof current, from: LocalDate, to: LocalDate) => {
    const revenue = summariseRevenue(from, to, period.payments, period.refunds, tz);
    const seats = summariseSeats(from, to, period.seats, { schedule: settings.schedule, overrides: period.overrides, rigs, timezone: tz });
    const kept = period.bookings.filter((b) => b.status !== "CANCELLED");
    return {
      revenue,
      seats,
      bookings: kept.length,
      averageGroup: kept.length ? kept.reduce((t, b) => t + b.seatCount, 0) / kept.length : 0,
      noShowRate: seats.sold ? seats.noShows / seats.sold : 0,
    };
  };
  const now = summarise(current, input.from, input.to);
  const before = summarise(previous, previousFrom, previousTo);
  const kpi = (value: number, prev: number): Kpi => ({ value, previous: prev, change: change(value, prev) });

  // New = their first live booking ever falls in this range.
  const customerIds = [...new Set(current.bookings.filter((b) => b.status !== "CANCELLED").map((b) => b.customerId))];
  const earlier = customerIds.length
    ? await db.booking.findMany({
        where: { customerId: { in: customerIds }, slotStart: { lt: current.start }, status: { in: ["CONFIRMED", "CHECKED_IN", "COMPLETED", "NO_SHOW"] } },
        distinct: ["customerId"],
        select: { customerId: true },
      })
    : [];
  const returning = new Set(earlier.map((b) => b.customerId));

  return {
    from: input.from,
    to: input.to,
    previousFrom,
    previousTo,
    timezone: tz,
    revenue: now.revenue,
    seats: now.seats,
    kpis: {
      netRevenuePaise: kpi(now.revenue.netPaise, before.revenue.netPaise),
      seatsSold: kpi(now.seats.sold, before.seats.sold),
      occupancy: kpi(now.seats.occupancy, before.seats.occupancy),
      bookings: kpi(now.bookings, before.bookings),
      averageGroup: kpi(now.averageGroup, before.averageGroup),
      noShowRate: kpi(now.noShowRate, before.noShowRate),
    },
    bookings: {
      total: current.bookings.length,
      cancelled: current.bookings.filter((b) => b.status === "CANCELLED").length,
      online: current.bookings.filter((b) => b.channel === "ONLINE" && b.status !== "CANCELLED").length,
      newCustomers: customerIds.length - returning.size,
      returningCustomers: returning.size,
    },
    sources: summariseSources(current.bookings.filter((b) => b.channel === "ONLINE" && b.status !== "CANCELLED")),
    experiences: Object.fromEntries(experiences.map((e) => [e.code, e.name])),
    rigs,
  };
}
