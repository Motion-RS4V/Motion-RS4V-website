import "server-only";

import type { PaymentMethod, PrismaClient } from "@/generated/prisma/client";
import { localToUtc, type LocalDate } from "@/server/booking";
import { loadSettings } from "@/server/settings";

export type TakingsLine = { method: PaymentMethod; collectedPaise: number; refundedPaise: number; netPaise: number; payments: number };

export type Takings = {
  date: LocalDate;
  lines: TakingsLine[];
  totals: { collectedPaise: number; refundedPaise: number; netPaise: number; payments: number };
  counter: { collectedPaise: number; refundedPaise: number; netPaise: number };
  cashInDrawerPaise: number;
  pendingDeskRefunds: { id: string; amountPaise: number; reference: string; method: PaymentMethod }[];
  sessions: { sold: number; checkedIn: number; noShows: number };
};

const COUNTER_METHODS: PaymentMethod[] = ["CASH", "UPI_COUNTER", "CARD_COUNTER"];

/**
 * What was taken and given back on one venue day, for the end-of-shift count.
 * Money is counted on the day it moved, not the day of the session, so the desk can reconcile the drawer.
 */
export async function getTakings(db: PrismaClient, date: LocalDate): Promise<Takings> {
  const settings = await loadSettings(db);
  const tz = settings.venue.timezone;
  const dayStart = localToUtc(date, "00:00", tz);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000);

  const [payments, refunds, seats, pending] = await Promise.all([
    db.payment.findMany({
      where: { status: { in: ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"] }, capturedAt: { gte: dayStart, lt: dayEnd } },
      select: { method: true, amountPaise: true },
    }),
    db.refund.findMany({
      where: {
        OR: [
          // Online refunds count the day they're issued, even while Razorpay is still paying them out.
          { status: { in: ["PENDING", "PROCESSED"] }, payment: { method: "RAZORPAY" }, createdAt: { gte: dayStart, lt: dayEnd } },
          // Desk refunds count when the money is handed back.
          { status: "PROCESSED", payment: { method: { not: "RAZORPAY" } }, processedAt: { gte: dayStart, lt: dayEnd } },
        ],
      },
      select: { amountPaise: true, payment: { select: { method: true } } },
    }),
    db.bookingSeat.findMany({
      where: { booking: { slotStart: { gte: dayStart, lt: dayEnd }, status: { in: ["CONFIRMED", "CHECKED_IN", "COMPLETED", "NO_SHOW"] } } },
      select: { status: true },
    }),
    db.refund.findMany({
      where: { status: "PENDING", payment: { method: { in: COUNTER_METHODS } } },
      orderBy: { createdAt: "asc" },
      select: { id: true, amountPaise: true, payment: { select: { method: true, booking: { select: { reference: true } } } } },
    }),
  ]);

  const byMethod = new Map<PaymentMethod, TakingsLine>();
  const line = (method: PaymentMethod) => {
    const existing = byMethod.get(method) ?? { method, collectedPaise: 0, refundedPaise: 0, netPaise: 0, payments: 0 };
    byMethod.set(method, existing);
    return existing;
  };
  for (const p of payments) {
    const l = line(p.method);
    l.collectedPaise += p.amountPaise;
    l.payments += 1;
  }
  for (const r of refunds) line(r.payment.method).refundedPaise += r.amountPaise;
  for (const l of byMethod.values()) l.netPaise = l.collectedPaise - l.refundedPaise;

  const lines = [...byMethod.values()].sort((a, b) => b.netPaise - a.netPaise);
  const sum = (pick: (l: TakingsLine) => number, only?: PaymentMethod[]) =>
    lines.filter((l) => !only || only.includes(l.method)).reduce((total, l) => total + pick(l), 0);

  return {
    date,
    lines,
    totals: {
      collectedPaise: sum((l) => l.collectedPaise),
      refundedPaise: sum((l) => l.refundedPaise),
      netPaise: sum((l) => l.netPaise),
      payments: sum((l) => l.payments),
    },
    counter: {
      collectedPaise: sum((l) => l.collectedPaise, COUNTER_METHODS),
      refundedPaise: sum((l) => l.refundedPaise, COUNTER_METHODS),
      netPaise: sum((l) => l.netPaise, COUNTER_METHODS),
    },
    cashInDrawerPaise: sum((l) => l.netPaise, ["CASH"]),
    pendingDeskRefunds: pending.map((r) => ({ id: r.id, amountPaise: r.amountPaise, reference: r.payment.booking.reference, method: r.payment.method })),
    sessions: {
      sold: seats.filter((s) => ["BOOKED", "CHECKED_IN", "COMPLETED"].includes(s.status)).length,
      checkedIn: seats.filter((s) => ["CHECKED_IN", "COMPLETED"].includes(s.status)).length,
      noShows: seats.filter((s) => s.status === "NO_SHOW").length,
    },
  };
}
