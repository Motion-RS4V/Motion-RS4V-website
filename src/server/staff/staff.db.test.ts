/**
 * Staff console operations against the real database (npm run test:db).
 * Sessions live in 2099 and everything created here is deleted afterwards.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cancelBooking, createBooking, getDayAvailability, localToUtc, previewCancellation } from "@/server/booking";
import { db } from "@/server/db";
import { fakeGateway } from "@/server/payments/fake-gateway";
import { markRefundPaid, refundBooking } from "@/server/payments/refunds";
import { getDayBoard, getStaffBooking, searchBookings } from "./board";
import { checkInBooking, createBlock, createWalkIn, liftBlock, markNoShow, reassignSeat, setCarStatus } from "./operations";

const IST = "Asia/Kolkata";
const DATE = "2099-08-10";
const at = (time: string) => localToUtc(DATE, time, IST);
const MORNING = at("09:00");

let staffId: string;
let n = 0;
const phone = () => `+9199997${String(Date.now() % 10_000).padStart(4, "0")}${n++ % 10}`;

function book(time: string, experiences: string[], names?: string[]) {
  return createBooking(db, {
    slotStart: at(time),
    seats: experiences.map((experienceCode, i) => ({ experienceCode, driverName: names?.[i] ?? `Driver ${i + 1}` })),
    customer: { name: "Desk Test", phone: phone() },
    channel: "PHONE",
    staffId,
    now: MORNING,
  });
}

async function cleanup() {
  const ids = (await db.booking.findMany({ where: { slotStart: { gte: new Date("2099-01-01T00:00:00Z") } }, select: { id: true } })).map((b) => b.id);
  await db.emailMessage.deleteMany({ where: { bookingId: { in: ids } } });
  await db.auditLog.deleteMany({ where: { entityType: "booking", entityId: { in: ids } } });
  await db.refund.deleteMany({ where: { payment: { bookingId: { in: ids } } } });
  await db.payment.deleteMany({ where: { bookingId: { in: ids } } });
  await db.booking.deleteMany({ where: { id: { in: ids } } });
  await db.customer.deleteMany({ where: { phone: { startsWith: "+9199997" }, bookings: { none: {} } } });
  await db.slotBlock.deleteMany({ where: { startsAt: { gte: new Date("2099-01-01T00:00:00Z") } } });
  await db.car.updateMany({ where: { status: "MAINTENANCE" }, data: { status: "READY" } });
}

beforeAll(async () => {
  await cleanup();
  staffId = (await db.staffProfile.findFirstOrThrow({ where: { role: "STAFF" } })).id;
});
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("staff console (live database)", () => {
  it("checks drivers in and gives each one a different rig and a car for their track", async () => {
    const booking = await book("10:00", ["track", "offroad"], ["Asha", "Kabir"]);
    const result = await checkInBooking(db, { bookingId: booking.id, actorId: staffId, now: at("09:55") });

    expect(result.bookingStatus).toBe("CHECKED_IN");
    expect(result.assignments).toHaveLength(2);
    expect(new Set(result.assignments.map((a) => a.rigId)).size).toBe(2);
    expect(result.assignments.every((a) => a.missing === null)).toBe(true);
    expect(result.assignments.map((a) => a.carLabel)).toEqual([expect.stringMatching(/^T/), expect.stringMatching(/^O/)]);

    const seats = await db.bookingSeat.findMany({ where: { bookingId: booking.id }, select: { status: true, checkedInAt: true } });
    expect(seats.every((s) => s.status === "CHECKED_IN" && s.checkedInAt)).toBe(true);
  });

  it("never hands the same rig or car to two bookings in one session", async () => {
    const first = await book("10:15", ["track"]);
    const second = await book("10:15", ["track"]);
    const a = await checkInBooking(db, { bookingId: first.id, actorId: staffId, now: at("10:10") });
    const b = await checkInBooking(db, { bookingId: second.id, actorId: staffId, now: at("10:10") });

    expect(a.assignments[0].rigId).not.toBe(b.assignments[0].rigId);
    expect(a.assignments[0].carId).not.toBe(b.assignments[0].carId);

    // Taking the other booking's car is refused.
    const seatId = b.assignments[0].seatId;
    await expect(reassignSeat(db, { seatId, carId: a.assignments[0].carId, actorId: staffId })).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("stops assigning a car once it's marked under repair, and the website stops selling its seats", async () => {
    const before = await getDayAvailability(db, DATE, { now: MORNING });
    const offroadBefore = before.slots.find((s) => s.localTime === "11:00")!.availability.byExperience.offroad.capacity;

    const cars = await db.car.findMany({ where: { experience: { code: "offroad" }, status: "READY" }, select: { id: true, label: true }, orderBy: { label: "asc" } });
    for (const car of cars.slice(1)) await setCarStatus(db, { carId: car.id, status: "MAINTENANCE", actorId: staffId });

    const after = await getDayAvailability(db, DATE, { now: MORNING });
    expect(after.slots.find((s) => s.localTime === "11:00")!.availability.byExperience.offroad.capacity).toBe(1);
    expect(offroadBefore).toBeGreaterThan(1);

    const booking = await book("11:00", ["offroad"]);
    const result = await checkInBooking(db, { bookingId: booking.id, actorId: staffId, now: at("10:55") });
    expect(result.assignments[0].carLabel).toBe(cars[0].label);

    for (const car of cars.slice(1)) await setCarStatus(db, { carId: car.id, status: "READY", actorId: staffId });
  });

  it("sells a walk-in seat with counter payment and shows it on the board", async () => {
    const booking = await createWalkIn(db, {
      slotStart: at("12:00"),
      seats: [{ experienceCode: "track", driverName: "Walk In" }],
      customer: { name: "Counter Customer", phone: phone() },
      payment: { method: "CASH" },
      actorId: staffId,
      now: at("11:58"),
    });
    expect(booking.status).toBe("CONFIRMED");

    const payment = await db.payment.findFirstOrThrow({ where: { bookingId: booking.id } });
    expect(payment).toMatchObject({ method: "CASH", status: "CAPTURED", amountPaise: 49_900, recordedById: staffId });

    const board = await getDayBoard(db, DATE, { now: at("11:59") });
    const slot = board.slots.find((s) => s.localTime === "12:00")!;
    expect(slot.sold).toBe(1);
    expect(slot.bookings[0]).toMatchObject({ channel: "WALK_IN", duePaise: 0, paidPaise: 49_900 });
  });

  it("marks a no-show and gives the seat back", async () => {
    const booking = await book("13:00", ["track", "track", "track", "track"]);
    const beforeFull = await getDayAvailability(db, DATE, { now: at("13:05") });
    expect(beforeFull.slots.find((s) => s.localTime === "13:00")!.availability.total.available).toBe(0);

    const result = await markNoShow(db, { bookingId: booking.id, actorId: staffId, now: at("13:06") });
    expect(result).toMatchObject({ seats: 4, bookingStatus: "NO_SHOW" });

    const after = await getDayAvailability(db, DATE, { now: at("13:06") });
    expect(after.slots.find((s) => s.localTime === "13:00")!.availability.total.available).toBe(4);
  });

  it("blocks a rig for maintenance and puts it back", async () => {
    const rig = await db.rig.findFirstOrThrow({ where: { status: "ACTIVE" }, orderBy: { sortOrder: "asc" } });
    const block = await createBlock(db, { startsAt: at("14:00"), endsAt: at("15:00"), rigId: rig.id, reason: "Wheel repair", actorId: staffId });

    const blocked = await getDayAvailability(db, DATE, { now: MORNING });
    expect(blocked.slots.find((s) => s.localTime === "14:15")!.availability.total.capacity).toBe(3);
    expect(blocked.slots.find((s) => s.localTime === "15:00")!.availability.total.capacity).toBe(4);

    const board = await getDayBoard(db, DATE, { now: MORNING });
    expect(board.slots.find((s) => s.localTime === "14:15")!.blockReasons).toEqual([`${rig.label}: Wheel repair`]);

    await liftBlock(db, { blockId: block.id, actorId: staffId });
    const lifted = await getDayAvailability(db, DATE, { now: MORNING });
    expect(lifted.slots.find((s) => s.localTime === "14:15")!.availability.total.capacity).toBe(4);
  });

  it("blocks the whole venue when no rig is named", async () => {
    const block = await createBlock(db, { startsAt: at("16:00"), endsAt: at("17:00"), reason: "Power cut", actorId: staffId });
    const day = await getDayAvailability(db, DATE, { now: MORNING });
    expect(day.slots.find((s) => s.localTime === "16:30")!.availability.total.capacity).toBe(0);
    await liftBlock(db, { blockId: block.id, actorId: staffId });
  });

  it("finds bookings by reference, mobile number and name", async () => {
    const booking = await book("18:00", ["track"]);
    const customer = await db.booking.findUniqueOrThrow({ where: { id: booking.id }, select: { customer: { select: { phone: true } } } });

    expect((await searchBookings(db, booking.reference, MORNING)).map((r) => r.id)).toContain(booking.id);
    expect((await searchBookings(db, customer.customer.phone, MORNING)).map((r) => r.id)).toContain(booking.id);
    expect((await searchBookings(db, "Desk Test", MORNING)).map((r) => r.id)).toContain(booking.id);
    expect(await searchBookings(db, "zz", MORNING)).toEqual([]);
  });

  it("refunds nothing for a late customer cancellation, but everything when the venue can't run the session", async () => {
    const booking = await book("20:00", ["track", "track"]);
    await db.payment.create({ data: { bookingId: booking.id, method: "CASH", status: "CAPTURED", amountPaise: booking.totalPaise, capturedAt: MORNING } });
    const lateNow = at("19:00"); // inside the 2-hour window

    const asCustomer = await previewCancellation(db, { bookingId: booking.id, actor: { kind: "staff", staffId }, now: lateNow });
    expect(asCustomer).toMatchObject({ allowed: true, refundPaise: 0, reason: "LATE_NO_REFUND" });

    const asVenue = await previewCancellation(db, { bookingId: booking.id, actor: { kind: "venue", staffId }, now: lateNow });
    expect(asVenue).toMatchObject({ allowed: true, refundPaise: booking.totalPaise, reason: "VENUE_CANCELLED" });

    const result = await cancelBooking(db, { bookingId: booking.id, actor: { kind: "venue", staffId }, reason: "Power cut", now: lateNow });
    expect(result.refundDuePaise).toBe(booking.totalPaise);
  });

  it("records a cash refund for the desk to hand back, and lets staff mark it done", async () => {
    const booking = await createWalkIn(db, {
      slotStart: at("20:30"),
      seats: [{ experienceCode: "track" }, { experienceCode: "track" }],
      customer: { name: "Cash Customer", phone: phone() },
      payment: { method: "CASH" },
      actorId: staffId,
      now: MORNING,
    });

    const cancelled = await cancelBooking(db, { bookingId: booking.id, actor: { kind: "customer" }, now: MORNING });
    expect(cancelled.refundDuePaise).toBe(booking.totalPaise);

    const refund = await refundBooking(db, fakeGateway(), { bookingId: booking.id, amountPaise: cancelled.refundDuePaise, reason: "Customer cancellation", actorId: staffId });
    expect(refund).toMatchObject({ refundedPaise: 0, counterDuePaise: booking.totalPaise, failedPaise: 0 });

    const view = await getStaffBooking(db, booking.id);
    expect(view.outstandingRefunds).toEqual([
      expect.objectContaining({ amountPaise: booking.totalPaise, kind: "COUNTER", method: "CASH", status: "PENDING" }),
    ]);

    await markRefundPaid(db, { refundId: view.outstandingRefunds[0].id, actorId: staffId });
    const after = await getStaffBooking(db, booking.id);
    expect(after.outstandingRefunds).toHaveLength(0);
    expect(after.refundedPaise).toBe(booking.totalPaise);
    expect((await db.payment.findFirstOrThrow({ where: { bookingId: booking.id } })).status).toBe("REFUNDED");
  });

  it("records who did what", async () => {
    const booking = await book("19:00", ["track"]);
    await checkInBooking(db, { bookingId: booking.id, actorId: staffId, now: at("18:55") });
    const entries = await db.auditLog.findMany({ where: { entityId: booking.id }, select: { action: true, actorId: true } });
    expect(entries.map((e) => e.action)).toContain("booking.check_in");
    expect(entries.every((e) => e.actorId === staffId)).toBe(true);
  });
});
