import type { BookingChannel, PaymentMethod, SeatStatus } from "@/generated/prisma/client";
import { generateSlots, hoursForDate, type ScheduleOverrideInput } from "@/server/booking/schedule";
import { addDays, dayOfWeek, timeToMinutes, utcToLocal, type LocalDate } from "@/server/booking/time";
import { DAYS, type Day, type Settings } from "@/server/settings/schema";

/**
 * Pure aggregation for the owner dashboard. The loader fetches rows; everything here is plain arithmetic
 * over them, so the numbers can be unit-tested without a database.
 */

export const DESK_METHODS: PaymentMethod[] = ["CASH", "UPI_COUNTER", "CARD_COUNTER"];
/** Seats that took up a rig: sold and not cancelled. No-shows count, because the seat was held for them. */
export const SOLD_SEAT_STATUSES: SeatStatus[] = ["BOOKED", "CHECKED_IN", "COMPLETED", "NO_SHOW"];

export function datesBetween(from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function daysInRange(from: LocalDate, to: LocalDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

// ───────────────────────────── Money ─────────────────────────────

export type PaymentRow = { method: PaymentMethod; amountPaise: number; capturedAt: Date };
/**
 * A refund that counts against revenue. `at` is when it was issued (online) or handed over (desk);
 * `pending` marks an online refund Razorpay has accepted but not yet paid out.
 */
export type RefundRow = { amountPaise: number; at: Date; method: PaymentMethod; pending: boolean };

export type RevenueDay = { date: LocalDate; onlinePaise: number; deskPaise: number; refundedPaise: number; netPaise: number };
export type Revenue = {
  days: RevenueDay[];
  collectedPaise: number;
  refundedPaise: number;
  /** Part of refundedPaise that Razorpay is still processing. */
  refundPendingPaise: number;
  netPaise: number;
  onlinePaise: number;
  deskPaise: number;
};

/**
 * Money on the day it moved: payments when captured, online refunds when issued (the money is committed to go back
 * even while Razorpay processes it), desk refunds when staff hand the cash over.
 */
export function summariseRevenue(from: LocalDate, to: LocalDate, payments: PaymentRow[], refunds: RefundRow[], tz: string): Revenue {
  const byDay = new Map(datesBetween(from, to).map((date) => [date, { date, onlinePaise: 0, deskPaise: 0, refundedPaise: 0, netPaise: 0 }]));
  for (const p of payments) {
    const day = byDay.get(utcToLocal(p.capturedAt, tz).date);
    if (!day) continue;
    if (p.method === "RAZORPAY") day.onlinePaise += p.amountPaise;
    else day.deskPaise += p.amountPaise;
  }
  let refundPendingPaise = 0;
  for (const r of refunds) {
    const day = byDay.get(utcToLocal(r.at, tz).date);
    if (!day) continue;
    day.refundedPaise += r.amountPaise;
    if (r.pending) refundPendingPaise += r.amountPaise;
  }
  const days = [...byDay.values()].map((d) => ({ ...d, netPaise: d.onlinePaise + d.deskPaise - d.refundedPaise }));
  const sum = (pick: (d: RevenueDay) => number) => days.reduce((t, d) => t + pick(d), 0);
  const onlinePaise = sum((d) => d.onlinePaise);
  const deskPaise = sum((d) => d.deskPaise);
  const refundedPaise = sum((d) => d.refundedPaise);
  return {
    days,
    onlinePaise,
    deskPaise,
    collectedPaise: onlinePaise + deskPaise,
    refundedPaise,
    refundPendingPaise,
    netPaise: onlinePaise + deskPaise - refundedPaise,
  };
}

// ───────────────────────────── Seats ─────────────────────────────

export type SeatRow = { status: SeatStatus; experienceCode: string; channel: BookingChannel; slotStart: Date };

export type CapacityInput = {
  schedule: Settings["schedule"];
  overrides: Map<LocalDate, ScheduleOverrideInput>;
  rigs: number;
  timezone: string;
};

/** Heatmap cell key: weekday and the hour a session starts in. */
const cellKey = (day: Day, hour: number) => `${day}:${hour}`;

/** Rig-seats the venue could have sold, per weekday × hour, from opening hours and today's working rigs. */
export function capacityCells(from: LocalDate, to: LocalDate, input: CapacityInput): Map<string, number> {
  const cells = new Map<string, number>();
  for (const date of datesBetween(from, to)) {
    const hours = hoursForDate(input.schedule, input.overrides.get(date) ?? null, date);
    for (const slot of generateSlots(date, hours, input.schedule.slotMinutes, input.timezone)) {
      const key = cellKey(dayOfWeek(date), Math.floor(timeToMinutes(slot.localTime) / 60));
      cells.set(key, (cells.get(key) ?? 0) + input.rigs);
    }
  }
  return cells;
}

export type HeatCell = { day: Day; hour: number; sold: number; capacity: number; share: number };
export type Seats = {
  sold: number;
  capacity: number;
  occupancy: number;
  checkedIn: number;
  noShows: number;
  cancelled: number;
  walkIns: number;
  byExperience: { code: string; seats: number }[];
  byChannel: { channel: BookingChannel; seats: number }[];
  heat: HeatCell[];
  hours: number[];
};

export function summariseSeats(from: LocalDate, to: LocalDate, rows: SeatRow[], capacity: CapacityInput): Seats {
  const cap = capacityCells(from, to, capacity);
  const soldCells = new Map<string, number>();
  const byExperience = new Map<string, number>();
  const byChannel = new Map<BookingChannel, number>();
  let sold = 0;
  let checkedIn = 0;
  let noShows = 0;
  let cancelled = 0;
  let walkIns = 0;

  for (const row of rows) {
    if (row.status === "CANCELLED") {
      cancelled++;
      continue;
    }
    if (!SOLD_SEAT_STATUSES.includes(row.status)) continue;
    sold++;
    if (row.status === "CHECKED_IN" || row.status === "COMPLETED") checkedIn++;
    if (row.status === "NO_SHOW") noShows++;
    if (row.channel === "WALK_IN") walkIns++;
    byExperience.set(row.experienceCode, (byExperience.get(row.experienceCode) ?? 0) + 1);
    byChannel.set(row.channel, (byChannel.get(row.channel) ?? 0) + 1);
    const local = utcToLocal(row.slotStart, capacity.timezone);
    const key = cellKey(local.day, Math.floor(timeToMinutes(local.time) / 60));
    soldCells.set(key, (soldCells.get(key) ?? 0) + 1);
  }

  const hourSet = new Set<number>();
  for (const key of [...cap.keys(), ...soldCells.keys()]) hourSet.add(Number(key.split(":")[1]));
  const hours = [...hourSet].sort((a, b) => a - b);
  const heat: HeatCell[] = [];
  for (const day of DAYS) {
    for (const hour of hours) {
      const c = cap.get(cellKey(day, hour)) ?? 0;
      const s = soldCells.get(cellKey(day, hour)) ?? 0;
      heat.push({ day, hour, sold: s, capacity: c, share: c > 0 ? Math.min(1, s / c) : 0 });
    }
  }

  const totalCapacity = [...cap.values()].reduce((t, n) => t + n, 0);
  return {
    sold,
    capacity: totalCapacity,
    occupancy: totalCapacity > 0 ? sold / totalCapacity : 0,
    checkedIn,
    noShows,
    cancelled,
    walkIns,
    byExperience: [...byExperience.entries()].map(([code, seats]) => ({ code, seats })).sort((a, b) => b.seats - a.seats),
    byChannel: [...byChannel.entries()].map(([channel, seats]) => ({ channel, seats })).sort((a, b) => b.seats - a.seats),
    heat,
    hours,
  };
}

// ───────────────────────────── Sources ─────────────────────────────

export type SourceRow = { utmSource: string | null; referrer: string | null };

/** Where online bookings came from: the utm_source tag, else the referring site, else "Direct". */
export function summariseSources(rows: SourceRow[], limit = 6): { source: string; bookings: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    let source = row.utmSource?.trim().toLowerCase() || "";
    if (!source && row.referrer) {
      try {
        source = new URL(row.referrer).hostname.replace(/^www\./, "");
      } catch {
        source = "";
      }
    }
    source ||= "Direct";
    counts.set(source, (counts.get(source) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([source, bookings]) => ({ source, bookings }))
    .sort((a, b) => b.bookings - a.bookings)
    .slice(0, limit);
}

/** Relative change, or null when there's nothing to compare against. */
export function change(current: number, previous: number): number | null {
  return previous === 0 ? null : (current - previous) / previous;
}
