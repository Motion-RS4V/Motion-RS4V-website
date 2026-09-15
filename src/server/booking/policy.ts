import type { Settings } from "@/server/settings";
import { addMinutes } from "./time";

/** The policy copied onto a booking when it's made. Later setting changes don't touch existing bookings. */
export type PolicySnapshot = Pick<
  Settings["policy"],
  "freeCancelHours" | "rescheduleCutoffMinutes" | "maxReschedules" | "noShowGraceMinutes"
>;

export function snapshotPolicy(policy: Settings["policy"]): PolicySnapshot {
  return {
    freeCancelHours: policy.freeCancelHours,
    rescheduleCutoffMinutes: policy.rescheduleCutoffMinutes,
    maxReschedules: policy.maxReschedules,
    noShowGraceMinutes: policy.noShowGraceMinutes,
  };
}

/** Who is asking. `venue` means the venue itself cancelled or moved the session (maintenance, a fault). */
export type Actor =
  | { kind: "customer" }
  | { kind: "staff"; staffId: string }
  | { kind: "venue"; staffId: string | null };

export type CancellationQuote =
  | { allowed: true; refundPaise: number; reason: "FREE_WINDOW" | "LATE_NO_REFUND" | "VENUE_CANCELLED" | "UNPAID" }
  | { allowed: false; reason: "SLOT_STARTED" };

/**
 * Refund for cancelling some or all of a booking's seats.
 * - Venue cancellations always refund in full.
 * - Otherwise: full refund up to `freeCancelHours` before the start, nothing after, and no cancelling once it has started.
 * Staff cancelling on a customer's behalf get the same answer; a manager who wants to go beyond policy issues a separate refund.
 */
export function quoteCancellation(input: {
  slotStart: Date;
  policy: PolicySnapshot;
  netPaidPaise: number; // captured payments minus refunds so far
  activeSeats: number; // seats not yet cancelled
  seatsToCancel: number;
  actor: Actor;
  now: Date;
}): CancellationQuote {
  const { slotStart, policy, netPaidPaise, activeSeats, seatsToCancel, actor, now } = input;
  const share = seatsToCancel >= activeSeats ? netPaidPaise : Math.floor((netPaidPaise * seatsToCancel) / activeSeats);

  if (actor.kind === "venue") return { allowed: true, refundPaise: share, reason: "VENUE_CANCELLED" };
  if (now >= slotStart) return { allowed: false, reason: "SLOT_STARTED" };
  if (netPaidPaise <= 0) return { allowed: true, refundPaise: 0, reason: "UNPAID" };
  if (now <= addMinutes(slotStart, -policy.freeCancelHours * 60)) {
    return { allowed: true, refundPaise: share, reason: "FREE_WINDOW" };
  }
  return { allowed: true, refundPaise: 0, reason: "LATE_NO_REFUND" };
}

export type RescheduleCheck =
  | { allowed: true; countsTowardLimit: boolean }
  | { allowed: false; reason: "TOO_LATE" | "LIMIT_REACHED" | "SLOT_STARTED" };

/** Customers get `maxReschedules` moves up to the cutoff. Staff and venue moves don't use up the customer's allowance. */
export function checkReschedule(input: {
  slotStart: Date;
  policy: PolicySnapshot;
  rescheduleCount: number;
  actor: Actor;
  now: Date;
}): RescheduleCheck {
  const { slotStart, policy, rescheduleCount, actor, now } = input;
  if (actor.kind === "venue") return { allowed: true, countsTowardLimit: false };
  if (now >= slotStart) return { allowed: false, reason: "SLOT_STARTED" };
  if (actor.kind === "staff") return { allowed: true, countsTowardLimit: false };
  if (now > addMinutes(slotStart, -policy.rescheduleCutoffMinutes)) return { allowed: false, reason: "TOO_LATE" };
  if (rescheduleCount >= policy.maxReschedules) return { allowed: false, reason: "LIMIT_REACHED" };
  return { allowed: true, countsTowardLimit: true };
}

export function isNoShowDue(slotStart: Date, policy: PolicySnapshot, now: Date): boolean {
  return now >= addMinutes(slotStart, policy.noShowGraceMinutes);
}
