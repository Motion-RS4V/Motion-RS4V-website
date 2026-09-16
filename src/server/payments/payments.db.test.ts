/**
 * Checkout, payment confirmation, refunds and manage links against the real database (npm run test:db).
 * Razorpay and email are faked, so nothing leaves the machine. Sessions are in 2099 and cleaned up afterwards.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createBooking, localToUtc } from "@/server/booking";
import { customerCancel, customerReschedule, sendManageLinks } from "@/server/manage/service";
import { hashToken, resolveManageToken } from "@/server/manage/tokens";
import { hitRateLimit } from "@/server/rate-limit";
import { CheckoutError, finalizePayment, releaseCheckout, startCheckout } from "./checkout";
import { fakeEmailProvider, fakeGateway } from "./fake-gateway";

const IST = "Asia/Kolkata";
const DATE = "2099-07-20";
const at = (time: string) => localToUtc(DATE, time, IST);
const MORNING = at("09:00");
const plus = (d: Date, minutes: number) => new Date(d.getTime() + minutes * 60_000);

let gateway: ReturnType<typeof fakeGateway>;
let mail: ReturnType<typeof fakeEmailProvider>;
let n = 0;
const phone = () => `+9199998${String(Date.now() % 10_000).padStart(4, "0")}${n++ % 10}`;

function checkout(time: string, seats: string[], over: { email?: string; now?: Date; phone?: string } = {}) {
  return startCheckout(db, gateway, {
    slotStart: at(time),
    seats: seats.map((experienceCode, i) => ({ experienceCode, driverName: `Driver ${i + 1}` })),
    customer: { name: "Test Customer", phone: over.phone ?? phone(), email: over.email ?? `driver${n}@rs4v.test` },
    termsAcceptedAt: MORNING,
    now: over.now ?? MORNING,
  });
}

async function paidBooking(time: string, seats: string[], email?: string) {
  const started = await checkout(time, seats, { email });
  const paymentId = gateway.pay(started.orderId);
  const result = await finalizePayment(db, gateway, { orderId: started.orderId, paymentId, now: plus(MORNING, 2) }, { emailProvider: mail });
  return { started, paymentId, result };
}

async function cleanup() {
  const bookings = await db.booking.findMany({ where: { slotStart: { gte: new Date("2099-01-01T00:00:00Z") } }, select: { id: true } });
  const ids = bookings.map((b) => b.id);
  await db.emailMessage.deleteMany({ where: { OR: [{ bookingId: { in: ids } }, { toAddress: { endsWith: "@rs4v.test" } }] } });
  await db.auditLog.deleteMany({ where: { entityType: "booking", entityId: { in: ids } } });
  await db.refund.deleteMany({ where: { payment: { bookingId: { in: ids } } } });
  await db.payment.deleteMany({ where: { bookingId: { in: ids } } });
  await db.booking.deleteMany({ where: { id: { in: ids } } });
  await db.customer.deleteMany({ where: { phone: { startsWith: "+9199998" }, bookings: { none: {} } } });
  await db.rateLimitHit.deleteMany({ where: { key: { startsWith: "test:" } } });
}

beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});
beforeEach(() => {
  gateway = fakeGateway();
  mail = fakeEmailProvider();
});

describe("checkout and payments (live database, fake Razorpay)", () => {
  it("confirms a paid booking once, stores the payment and emails a working manage link", async () => {
    const { started, result } = await paidBooking("18:00", ["track", "offroad"], "riya@rs4v.test");
    expect(started.amountPaise).toBe(2 * 49_900);
    expect(result.outcome).toBe("CONFIRMED");

    const booking = await db.booking.findUniqueOrThrow({ where: { id: started.bookingId }, include: { payments: true } });
    expect(booking.status).toBe("CONFIRMED");
    expect(booking.contactEmail).toBe("riya@rs4v.test");
    expect(booking.payments[0]).toMatchObject({ status: "CAPTURED", amountPaise: 99_800 });

    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].to).toBe("riya@rs4v.test");
    expect(mail.sent[0].subject).toContain(booking.reference);
    const token = "token" in result ? result.token : "";
    expect(mail.sent[0].text).toContain("/manage/");
    expect(await resolveManageToken(db, token)).toBe(started.bookingId);

    // The webhook arriving afterwards changes nothing and sends no second email.
    const again = await finalizePayment(db, gateway, { orderId: started.orderId, paymentId: booking.payments[0].razorpayPaymentId! }, { emailProvider: mail });
    expect(again.outcome).toBe("ALREADY_CONFIRMED");
    expect(mail.sent).toHaveLength(1);
    expect(await db.emailMessage.count({ where: { bookingId: started.bookingId, status: "SENT" } })).toBe(1);
  });

  it("stores only a hash of each manage token", async () => {
    const { result } = await paidBooking("18:15", ["track"]);
    const token = "token" in result ? result.token : "";
    const stored = await db.manageToken.findUnique({ where: { tokenHash: hashToken(token) } });
    expect(stored).not.toBeNull();
    expect(await db.manageToken.count({ where: { tokenHash: token } })).toBe(0);
    expect(await resolveManageToken(db, token, new Date("2100-01-01T00:00:00Z"))).toBeNull(); // expired
    expect(await resolveManageToken(db, "x".repeat(43))).toBeNull();
  });

  it("refuses a payment whose amount doesn't match the order", async () => {
    const started = await checkout("18:30", ["track"]);
    const paymentId = gateway.pay(started.orderId, { amount: 100 });
    await expect(finalizePayment(db, gateway, { orderId: started.orderId, paymentId }, { emailProvider: mail })).rejects.toBeInstanceOf(CheckoutError);
    expect((await db.booking.findUniqueOrThrow({ where: { id: started.bookingId } })).status).toBe("PENDING_PAYMENT");
  });

  it("refunds in full, exactly once, when the seats went while the customer was paying", async () => {
    const slow = await checkout("19:00", ["track", "track", "track", "track"]);
    const fast = await checkout("19:00", ["offroad", "offroad", "offroad", "offroad"], { now: plus(MORNING, 11) });
    expect(fast.amountPaise).toBe(4 * 49_900);

    const paymentId = gateway.pay(slow.orderId);
    const result = await finalizePayment(db, gateway, { orderId: slow.orderId, paymentId, now: plus(MORNING, 12) }, { emailProvider: mail });
    expect(result).toMatchObject({ outcome: "REFUNDED_UNAVAILABLE", refundedPaise: 4 * 49_900 });
    expect(gateway.refunds).toHaveLength(1);
    expect((await db.payment.findFirstOrThrow({ where: { bookingId: slow.bookingId } })).status).toBe("REFUNDED");
    expect(mail.sent.map((m) => m.subject)).toEqual([expect.stringContaining("full refund")]);

    const replay = await finalizePayment(db, gateway, { orderId: slow.orderId, paymentId, now: plus(MORNING, 13) }, { emailProvider: mail });
    expect(replay.outcome).toBe("REFUNDED_UNAVAILABLE");
    expect(gateway.refunds).toHaveLength(1);
  });

  it("releases the seats when checkout is closed without paying", async () => {
    const started = await checkout("19:15", ["track", "track", "offroad", "offroad"]);
    expect(await releaseCheckout(db, started.orderId)).toBe(true);
    expect((await db.booking.findUniqueOrThrow({ where: { id: started.bookingId } })).status).toBe("CANCELLED");
    const next = await checkout("19:15", ["track", "track", "track", "track"]);
    expect(next.amountPaise).toBe(4 * 49_900);
    expect(await releaseCheckout(db, "order_unknown")).toBe(false);
  });

  it("lets the hold go if Razorpay can't create an order", async () => {
    gateway.failNextOrder = true;
    await expect(checkout("19:30", ["track", "track", "track", "track"])).rejects.toMatchObject({ code: "PAYMENT_UNAVAILABLE" });
    const retry = await checkout("19:30", ["track", "track", "track", "track"]);
    expect(retry.orderId).toMatch(/^order_/);
  });

  it("refunds a cancelled driver inside the free window and nothing after it", async () => {
    const { started } = await paidBooking("20:00", ["track", "offroad"], "group@rs4v.test");
    const seats = await db.bookingSeat.findMany({ where: { bookingId: started.bookingId }, select: { id: true } });

    const first = await customerCancel(db, gateway, { bookingId: started.bookingId, seatIds: [seats[0].id], now: MORNING }, mail);
    expect(first).toMatchObject({ bookingStatus: "CONFIRMED", cancelledSeats: 1, refundedPaise: 49_900 });
    expect((await db.payment.findFirstOrThrow({ where: { bookingId: started.bookingId } })).status).toBe("PARTIALLY_REFUNDED");

    const rest = await customerCancel(db, gateway, { bookingId: started.bookingId, now: at("19:00") }, mail);
    expect(rest).toMatchObject({ bookingStatus: "CANCELLED", refundedPaise: 0 });
    expect(gateway.refunds.map((r) => r.amount)).toEqual([49_900]);
    expect(mail.sent.slice(-2).map((m) => m.subject)).toEqual([
      expect.stringContaining("1 driver removed"),
      expect.stringContaining("Booking cancelled"),
    ]);
  });

  it("moves a booking and emails the new time with a fresh link", async () => {
    const { started } = await paidBooking("20:15", ["offroad"], "mover@rs4v.test");
    const moved = await customerReschedule(db, { bookingId: started.bookingId, newSlotStart: at("20:45"), now: MORNING }, mail);
    expect(moved.slotStart).toEqual(at("20:45"));
    expect(mail.sent.at(-1)!.subject).toContain("Booking moved");
  });

  it("sends manage links only to the email saved on the booking", async () => {
    const customerPhone = phone();
    const started = await checkout("21:00", ["track"], { email: "owner-of-booking@rs4v.test", phone: customerPhone });
    await finalizePayment(db, gateway, { orderId: started.orderId, paymentId: gateway.pay(started.orderId), now: plus(MORNING, 1) }, { emailProvider: mail });
    mail.sent.length = 0;

    expect(await sendManageLinks(db, customerPhone, MORNING, mail)).toBe(1);
    expect(mail.sent[0].to).toBe("owner-of-booking@rs4v.test");
    const token = mail.sent[0].text.match(/\/manage\/([A-Za-z0-9_-]+)/)![1];
    expect(await resolveManageToken(db, token)).toBe(started.bookingId);

    expect(await sendManageLinks(db, "OWNER-OF-BOOKING@rs4v.test", MORNING, mail)).toBe(1);
    expect(await sendManageLinks(db, "stranger@rs4v.test", MORNING, mail)).toBe(0);
    expect(await sendManageLinks(db, "12345", MORNING, mail)).toBe(0);
  });

  it("walk-in bookings still work alongside online checkout", async () => {
    const walkIn = await createBooking(db, {
      slotStart: at("21:15"),
      seats: [{ experienceCode: "track" }],
      customer: { name: "Walk In", phone: phone() },
      channel: "WALK_IN",
      now: at("21:16"),
    });
    expect(walkIn.status).toBe("CONFIRMED");
  });

  it("rate-limits repeated attempts within a window", async () => {
    const key = `test:${Date.now()}`;
    const results = [];
    for (let i = 0; i < 4; i++) results.push((await hitRateLimit(db, key, 3, 600)).allowed);
    expect(results).toEqual([true, true, true, false]);
  });
});
