/**
 * Runs the booking engine against the real database (npm run test:db).
 * Uses sessions in the year 2099 with an injected clock, and deletes everything it created.
 * Assumes the seeded venue: 4 active rigs, 4 track cars, 4 off-road cars. Prices and no-show grace are read from the live settings,
 * so an owner changing them doesn't break the suite (test dates are Mondays, clear of weekend price rules).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { loadSettings } from "@/server/settings";
import {
  BookingError,
  cancelBooking,
  confirmHeldBooking,
  createBooking,
  getDayAvailability,
  markNoShows,
  rescheduleBooking,
  type CreateBookingInput,
} from "./index";
import { localToUtc } from "./time";

const IST = "Asia/Kolkata";
const DATE = "2099-06-15";
const at = (time: string) => localToUtc(DATE, time, IST);
const plusMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);
const MORNING = at("09:00");

let phoneCounter = 0;
const testPhone = () => `+9199999${String(Date.now() % 10_000).padStart(4, "0")}${phoneCounter++ % 10}`;

function book(time: string, seats: string[], over: Partial<CreateBookingInput> = {}) {
  return createBooking(db, {
    slotStart: at(time),
    seats: seats.map((experienceCode) => ({ experienceCode })),
    customer: { name: "Test Driver", phone: testPhone() },
    channel: "ONLINE",
    now: MORNING,
    ...over,
  });
}

async function codeOf(p: Promise<unknown>) {
  try {
    await p;
    return "OK";
  } catch (e) {
    if (e instanceof BookingError) return e.code;
    throw e;
  }
}

async function cleanup() {
  const bookings = await db.booking.findMany({ where: { slotStart: { gte: new Date("2099-01-01T00:00:00Z") } }, select: { id: true } });
  const ids = bookings.map((b) => b.id);
  await db.auditLog.deleteMany({ where: { entityType: "booking", entityId: { in: ids } } });
  await db.refund.deleteMany({ where: { payment: { bookingId: { in: ids } } } });
  await db.payment.deleteMany({ where: { bookingId: { in: ids } } });
  await db.booking.deleteMany({ where: { id: { in: ids } } });
  await db.customer.deleteMany({ where: { phone: { startsWith: "+9199999" }, bookings: { none: {} } } });
}

// The live base price and no-show grace, so owner changes in the console don't break these expectations.
let PRICE = 0;
let GRACE = 0;
/** Sessions on a Monday under the live weekly hours. */
let MONDAY_SLOTS = 0;
beforeAll(async () => {
  await cleanup();
  const settings = await loadSettings(db);
  PRICE = settings.pricing.basePricePaise;
  GRACE = settings.policy.noShowGraceMinutes;
  const mon = settings.schedule.weeklyHours.mon;
  const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  MONDAY_SLOTS = mon ? Math.floor((minutes(mon.closesAt) - minutes(mon.opensAt)) / settings.schedule.slotMinutes) : 0;
});
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("booking engine (live database)", () => {
  it("never oversells a slot when six people book at the same moment", async () => {
    const attempts = ["track", "offroad", "track", "offroad", "track", "offroad"].map((exp) => book("18:00", [exp]));
    const results = await Promise.all(attempts.map(codeOf));

    expect(results.filter((r) => r === "OK")).toHaveLength(4);
    expect(results.filter((r) => r === "SLOT_FULL")).toHaveLength(2);

    const sold = await db.bookingSeat.count({ where: { booking: { slotStart: at("18:00") } } });
    expect(sold).toBe(4);
  });

  it("sells a mixed group, then shows the slot as full", async () => {
    const group = await book("18:15", ["track", "track", "offroad", "offroad"]);
    expect(group.status).toBe("PENDING_PAYMENT");
    expect(group.totalPaise).toBe(4 * PRICE);
    expect(group.reference).toMatch(/^RS4V-[2-9A-HJKMNP-Z]{6}$/);

    expect(await codeOf(book("18:15", ["track"]))).toBe("SLOT_FULL");

    const day = await getDayAvailability(db, DATE, { now: MORNING });
    const slot = day.slots.find((s) => s.localTime === "18:15")!;
    expect(slot).toMatchObject({ bookable: false, unavailableReason: "FULL" });
    expect(day.slots).toHaveLength(MONDAY_SLOTS);
  });

  it("frees an unpaid hold after 10 minutes, and re-checks seats if payment arrives late", async () => {
    const late = await book("18:30", ["track", "track", "track", "track"]);
    const later = plusMinutes(MORNING, 11);

    const second = await book("18:30", ["offroad", "offroad", "offroad", "offroad"], { now: later });
    expect(second.status).toBe("PENDING_PAYMENT");

    const lateConfirm = await confirmHeldBooking(db, { bookingId: late.id, now: plusMinutes(MORNING, 12) });
    expect(lateConfirm.outcome).toBe("NO_LONGER_AVAILABLE");
    expect(lateConfirm.booking.status).toBe("EXPIRED");

    const onTime = await confirmHeldBooking(db, { bookingId: second.id, now: plusMinutes(MORNING, 13) });
    expect(onTime.outcome).toBe("CONFIRMED");
    expect((await confirmHeldBooking(db, { bookingId: second.id, now: plusMinutes(MORNING, 14) })).outcome).toBe("ALREADY_CONFIRMED");
  });

  it("refunds a cancelled seat inside the free window, and nothing after it", async () => {
    const booking = await book("19:00", ["track", "offroad"], { channel: "PHONE" });
    expect(booking.status).toBe("CONFIRMED");
    await db.payment.create({
      data: { bookingId: booking.id, method: "RAZORPAY", status: "CAPTURED", amountPaise: booking.totalPaise, capturedAt: MORNING },
    });

    const first = await cancelBooking(db, {
      bookingId: booking.id,
      seatIds: [booking.seats[0].id],
      actor: { kind: "customer" },
      now: MORNING,
    });
    expect(first).toMatchObject({ bookingStatus: "CONFIRMED", refundDuePaise: PRICE, refundReason: "FREE_WINDOW" });

    const rest = await cancelBooking(db, { bookingId: booking.id, actor: { kind: "customer" }, now: at("18:00") });
    expect(rest).toMatchObject({ bookingStatus: "CANCELLED", refundDuePaise: 0, refundReason: "LATE_NO_REFUND" });
  });

  it("lets a customer move once, then only staff can move it again", async () => {
    const booking = await book("19:15", ["offroad"], { channel: "PHONE" });

    const moved = await rescheduleBooking(db, { bookingId: booking.id, newSlotStart: at("19:30"), actor: { kind: "customer" }, now: MORNING });
    expect(moved).toMatchObject({ rescheduleCount: 1, slotStart: at("19:30") });

    const again = rescheduleBooking(db, { bookingId: booking.id, newSlotStart: at("19:45"), actor: { kind: "customer" }, now: MORNING });
    expect(await codeOf(again)).toBe("RESCHEDULE_NOT_ALLOWED");

    const staffId = (await db.staffProfile.findFirstOrThrow({ where: { role: "STAFF" } })).id;
    const byStaff = await rescheduleBooking(db, { bookingId: booking.id, newSlotStart: at("19:45"), actor: { kind: "staff", staffId }, now: MORNING });
    expect(byStaff).toMatchObject({ rescheduleCount: 1, slotStart: at("19:45") });
  });

  it("marks no-shows once the grace period after the start has passed, and gives the seats back", async () => {
    const booking = await book("20:00", ["track", "track", "track", "track"], { channel: "PHONE" });

    await markNoShows(db, plusMinutes(at("20:00"), GRACE - 1));
    expect((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe("CONFIRMED");

    expect(await markNoShows(db, plusMinutes(at("20:00"), GRACE))).toBe(4);
    expect((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe("NO_SHOW");

    const walkIn = await book("20:00", ["offroad"], { channel: "WALK_IN", now: plusMinutes(at("20:00"), 5) });
    expect(walkIn.status).toBe("CONFIRMED");
  });

  it("sells from the kiosk right up to the end of a running session, on a short hold", async () => {
    const settings = await loadSettings(db);
    const justStarted = plusMinutes(at("11:00"), 1);

    // The website has closed this session; the screen at the counter has not.
    expect(await codeOf(book("11:00", ["track"], { now: justStarted }))).toBe("SLOT_IN_PAST");

    const kiosk = await book("11:00", ["track"], { channel: "KIOSK", now: justStarted });
    expect(kiosk.status).toBe("PENDING_PAYMENT");
    expect(kiosk.holdExpiresAt).toEqual(plusMinutes(justStarted, settings.kiosk.paymentHoldMinutes));

    // Paying after the session has started still confirms: the customer is standing at the counter.
    expect((await confirmHeldBooking(db, { bookingId: kiosk.id, now: plusMinutes(justStarted, 1) })).outcome).toBe("CONFIRMED");

    // Once the session is over, the kiosk stops selling it too.
    expect(await codeOf(book("11:00", ["track"], { channel: "KIOSK", now: at("11:15") }))).toBe("SLOT_IN_PAST");
  });

  it("refuses sessions that can't be sold", async () => {
    expect(await codeOf(book("18:07", ["track"]))).toBe("SLOT_NOT_FOUND");
    expect(await codeOf(book("09:30", ["track"]))).toBe("SLOT_NOT_FOUND"); // before opening
    expect(await codeOf(book("10:00", ["track"], { now: at("09:55") }))).toBe("ONLINE_BOOKING_CLOSED");
    expect(await codeOf(book("10:00", ["track"], { now: localToUtc("2099-05-01", "09:00", IST) }))).toBe("OUTSIDE_BOOKING_WINDOW");
    expect(await codeOf(book("10:00", ["track"], { customer: { name: "X", phone: "12345" } }))).toBe("INVALID_PHONE");
    expect(await codeOf(book("10:00", ["track", "track", "track", "track", "track"]))).toBe("TOO_MANY_SEATS");
    expect(await codeOf(book("10:00", ["karting"]))).toBe("UNKNOWN_EXPERIENCE");
  });
});
