import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/server/settings";
import { checkReschedule, isNoShowDue, quoteCancellation, snapshotPolicy } from "./policy";

const policy = snapshotPolicy(DEFAULT_SETTINGS.policy); // 2 h free cancel, 30 min reschedule cutoff, 1 move, 5 min grace
const start = new Date("2026-09-19T12:45:00Z"); // 18:15 IST
const before = (minutes: number) => new Date(start.getTime() - minutes * 60_000);
const customer = { kind: "customer" } as const;

const cancel = (now: Date, over: Partial<Parameters<typeof quoteCancellation>[0]> = {}) =>
  quoteCancellation({ slotStart: start, policy, netPaidPaise: 99_800, activeSeats: 2, seatsToCancel: 2, actor: customer, now, ...over });

describe("cancellation", () => {
  it("refunds in full up to 2 hours before", () => {
    expect(cancel(before(24 * 60))).toEqual({ allowed: true, refundPaise: 99_800, reason: "FREE_WINDOW" });
    expect(cancel(before(120))).toEqual({ allowed: true, refundPaise: 99_800, reason: "FREE_WINDOW" });
  });

  it("allows a late cancellation but refunds nothing", () => {
    expect(cancel(before(119))).toEqual({ allowed: true, refundPaise: 0, reason: "LATE_NO_REFUND" });
  });

  it("can't cancel once the session has started", () => {
    expect(cancel(start)).toEqual({ allowed: false, reason: "SLOT_STARTED" });
  });

  it("refunds in full when the venue cancels, at any time", () => {
    expect(cancel(start, { actor: { kind: "venue", staffId: null } })).toMatchObject({ refundPaise: 99_800, reason: "VENUE_CANCELLED" });
  });

  it("refunds a fair share when part of a group cancels, and the rest on the last seat", () => {
    expect(cancel(before(300), { netPaidPaise: 149_700, activeSeats: 3, seatsToCancel: 1 })).toMatchObject({ refundPaise: 49_900 });
    expect(cancel(before(300), { netPaidPaise: 100_001, activeSeats: 3, seatsToCancel: 1 })).toMatchObject({ refundPaise: 33_333 });
    expect(cancel(before(300), { netPaidPaise: 66_668, activeSeats: 2, seatsToCancel: 2 })).toMatchObject({ refundPaise: 66_668 });
  });
});

describe("rescheduling", () => {
  const move = (now: Date, rescheduleCount = 0, actor: Parameters<typeof checkReschedule>[0]["actor"] = customer) =>
    checkReschedule({ slotStart: start, policy, rescheduleCount, actor, now });

  it("gives customers one move up to 30 minutes before", () => {
    expect(move(before(30))).toEqual({ allowed: true, countsTowardLimit: true });
    expect(move(before(29))).toEqual({ allowed: false, reason: "TOO_LATE" });
    expect(move(before(300), 1)).toEqual({ allowed: false, reason: "LIMIT_REACHED" });
  });

  it("lets staff move a booking without using the customer's allowance", () => {
    expect(move(before(5), 1, { kind: "staff", staffId: "s" })).toEqual({ allowed: true, countsTowardLimit: false });
    expect(move(start, 0, { kind: "staff", staffId: "s" })).toEqual({ allowed: false, reason: "SLOT_STARTED" });
  });
});

describe("no-shows", () => {
  it("are due 5 minutes after the start", () => {
    expect(isNoShowDue(start, policy, new Date(start.getTime() + 4 * 60_000 + 59_000))).toBe(false);
    expect(isNoShowDue(start, policy, new Date(start.getTime() + 5 * 60_000))).toBe(true);
  });
});
