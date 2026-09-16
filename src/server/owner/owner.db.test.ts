/**
 * Owner area against the real database (npm run test:db).
 * Settings are only exercised through refused saves, so the venue's stored settings never change.
 * Everything else lives in 2099 or carries a "Test" label, and is deleted afterwards.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBooking, getDayAvailability, localToUtc } from "@/server/booking";
import { db } from "@/server/db";
import { DAYS, InvalidSettingsError, loadSettings, type Settings } from "@/server/settings";
import { listActivity } from "./activity";
import { listCustomers } from "./customers";
import { getDashboard } from "./dashboard";
import { OwnerError, ScheduleConflictError } from "./errors";
import { createCar, createRig, moveRig, updateRig } from "./fleet";
import { listOverrides, removeOverride, saveOverride } from "./overrides";
import { saveSettingsGroup } from "./settings";
import { updateStaff } from "./staff-accounts";

const DATE = "2099-09-14";
const FREE_DATE = "2099-09-15";
const TEST_RIG = `Test Rig ${Date.now() % 100_000}`;

let ownerId: string;
let tz: string;
let now: Date;
let booking: { id: string; reference: string };

async function cleanup() {
  const ids = (await db.booking.findMany({ where: { slotStart: { gte: new Date(`${DATE}T00:00:00Z`), lt: new Date("2099-09-16T00:00:00Z") } }, select: { id: true } })).map((b) => b.id);
  await db.auditLog.deleteMany({ where: { entityType: "booking", entityId: { in: ids } } });
  await db.payment.deleteMany({ where: { bookingId: { in: ids } } });
  await db.booking.deleteMany({ where: { id: { in: ids } } });
  await db.customer.deleteMany({ where: { phone: { startsWith: "+9199996" }, bookings: { none: {} } } });
  await db.scheduleOverride.deleteMany({ where: { date: { gte: new Date("2099-01-01T00:00:00Z") } } });
  await db.auditLog.deleteMany({ where: { entityType: "schedule_override", entityId: { startsWith: "2099-" } } });
  const rigs = await db.rig.findMany({ where: { label: { startsWith: "Test Rig" } }, select: { id: true } });
  await db.auditLog.deleteMany({ where: { entityType: "rig", entityId: { in: rigs.map((r) => r.id) } } });
  await db.rig.deleteMany({ where: { id: { in: rigs.map((r) => r.id) } } });
}

beforeAll(async () => {
  await cleanup();
  ownerId = (await db.staffProfile.findFirstOrThrow({ where: { role: "OWNER", active: true } })).id;
  tz = (await loadSettings(db)).venue.timezone;
  now = localToUtc("2099-09-01", "09:00", tz);

  const day = await getDayAvailability(db, DATE, { now, channel: "PHONE" });
  const lastSlot = day.slots.at(-1);
  if (!lastSlot) throw new Error("the test date needs opening hours");
  booking = await createBooking(db, {
    slotStart: lastSlot.start,
    seats: [{ experienceCode: "track", driverName: "Late Driver" }],
    customer: { name: "Owner Test", phone: `+9199996${String(Date.now() % 100_000).padStart(5, "0")}` },
    channel: "PHONE",
    staffId: ownerId,
    now,
  });
});
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("owner settings (live database)", () => {
  it("refuses a schedule that would strand an upcoming booking, and saves nothing", async () => {
    const before = await loadSettings(db);
    const allClosed = { ...before.schedule, weeklyHours: Object.fromEntries(DAYS.map((d) => [d, null])) as Settings["schedule"]["weeklyHours"] };
    const error = (await saveSettingsGroup(db, { key: "schedule", value: allClosed, actorId: ownerId, now }).catch((e: unknown) => e)) as ScheduleConflictError;

    expect(error).toBeInstanceOf(ScheduleConflictError);
    expect(error.stranded.map((s) => s.reference)).toContain(booking.reference);
    expect((await loadSettings(db)).schedule).toEqual(before.schedule);
  });

  it("names the field when a group is invalid", async () => {
    const before = await loadSettings(db);
    const error = await saveSettingsGroup(db, { key: "policy", value: { ...before.policy, maxSeatsPerBooking: 0 }, actorId: ownerId }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InvalidSettingsError);
    expect((error as InvalidSettingsError).fieldIssues[0]?.path).toBe("maxSeatsPerBooking");
    expect((await loadSettings(db)).policy).toEqual(before.policy);
  });
});

describe("special dates (live database)", () => {
  it("won't close or shorten a date with bookings outside the new hours", async () => {
    await expect(saveOverride(db, { date: DATE, closed: true, actorId: ownerId, now })).rejects.toBeInstanceOf(ScheduleConflictError);
    await expect(saveOverride(db, { date: DATE, closed: false, opensAt: "10:00", closesAt: "12:00", actorId: ownerId, now })).rejects.toBeInstanceOf(ScheduleConflictError);
    expect(await listOverrides(db, DATE)).toEqual([]);
  });

  it("closes a free date, shows it, and puts it back", async () => {
    await saveOverride(db, { date: FREE_DATE, closed: true, note: "Test closure", actorId: ownerId, now });
    expect(await listOverrides(db, DATE)).toEqual([{ date: FREE_DATE, closed: true, opensAt: null, closesAt: null, note: "Test closure" }]);
    expect((await getDayAvailability(db, FREE_DATE, { now, channel: "PHONE" })).slots).toEqual([]);

    await removeOverride(db, { date: FREE_DATE, actorId: ownerId, now });
    expect(await listOverrides(db, DATE)).toEqual([]);
    expect((await getDayAvailability(db, FREE_DATE, { now, channel: "PHONE" })).slots.length).toBeGreaterThan(0);
  });

  it("rejects closing time before opening time", async () => {
    await expect(saveOverride(db, { date: FREE_DATE, closed: false, opensAt: "20:00", closesAt: "12:00", actorId: ownerId, now })).rejects.toBeInstanceOf(OwnerError);
  });
});

describe("fleet admin (live database)", () => {
  it("adds, renames and reorders a rig, and refuses duplicate names", async () => {
    const rig = await createRig(db, { label: `  ${TEST_RIG} `, actorId: ownerId });
    expect(rig).toMatchObject({ label: TEST_RIG, status: "ACTIVE" });

    const dup = await createRig(db, { label: TEST_RIG, actorId: ownerId }).catch((e: unknown) => e);
    expect(dup).toBeInstanceOf(OwnerError);
    expect((dup as OwnerError).status).toBe(409);

    await updateRig(db, { rigId: rig.id, label: `${TEST_RIG} B`, notes: "left wall", actorId: ownerId });
    const order = async () => (await db.rig.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true } })).map((r) => r.id);
    expect((await order()).at(-1)).toBe(rig.id);
    await moveRig(db, { rigId: rig.id, direction: "up", actorId: ownerId });
    const after = await order();
    expect(after.indexOf(rig.id)).toBe(after.length - 2);
    // Put it back at the end so the real rigs keep their order once it's deleted.
    await moveRig(db, { rigId: rig.id, direction: "down", actorId: ownerId });
  });

  it("needs a real track for a new car", async () => {
    await expect(createCar(db, { label: "Test Car", experienceCode: "no-such-track", actorId: ownerId })).rejects.toBeInstanceOf(OwnerError);
  });
});

describe("staff accounts (live database)", () => {
  it("won't let an owner remove their own owner access", async () => {
    await expect(updateStaff(db, { staffId: ownerId, role: "STAFF", actorId: ownerId })).rejects.toThrow(/your own owner access/);
    await expect(updateStaff(db, { staffId: ownerId, active: false, actorId: ownerId })).rejects.toBeInstanceOf(OwnerError);
    expect((await db.staffProfile.findUniqueOrThrow({ where: { id: ownerId } })).role).toBe("OWNER");
  });
});

describe("reports (live database)", () => {
  it("finds the test customer with their booking", async () => {
    const { rows, total } = await listCustomers(db, { search: "Owner Test", sort: "recent", now });
    expect(total).toBeGreaterThanOrEqual(1);
    expect(rows[0]).toMatchObject({ name: "Owner Test", bookings: 1, visits: 0, spendPaise: 0 });
    expect(rows[0].nextSession?.getTime()).toBeGreaterThan(now.getTime());
  });

  it("counts the booked seat on the dashboard", async () => {
    const d = await getDashboard(db, { from: DATE, to: DATE });
    expect(d.seats.sold).toBe(1);
    expect(d.seats.capacity).toBeGreaterThan(0);
    expect(d.kpis.bookings.value).toBe(1);
    expect(d.bookings.newCustomers).toBe(1);
    expect(d.revenue.days).toHaveLength(1);
  });

  it("lists activity newest first with booking references", async () => {
    const { entries } = await listActivity(db, { area: "bookings", limit: 200 });
    const mine = entries.find((e) => e.entityId === booking.id);
    expect(mine?.bookingReference).toBe(booking.reference);
    for (let i = 1; i < entries.length; i++) expect(BigInt(entries[i - 1].id) > BigInt(entries[i].id)).toBe(true);
  });
});
