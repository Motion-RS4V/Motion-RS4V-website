import { describe, expect, it } from "vitest";
import { localToUtc } from "@/server/booking/time";
import { DEFAULT_SETTINGS, type Settings } from "@/server/settings";
import { findStrandedBookings } from "./schedule-change";

const IST = "Asia/Kolkata";
const DATE = "2099-08-10"; // a Monday
const booking = (time: string, reference = `RS4V-${time}`) => ({ reference, slotStart: localToUtc(DATE, time, IST) });
const schedule = (patch: Partial<Settings["schedule"]>): Settings["schedule"] => ({ ...DEFAULT_SETTINGS.schedule, ...patch });
const hours = (mon: Settings["schedule"]["weeklyHours"]["mon"]) => ({ ...DEFAULT_SETTINGS.schedule.weeklyHours, mon });

describe("findStrandedBookings", () => {
  it("passes bookings that still sit on the grid", () => {
    const result = findStrandedBookings(schedule({}), [booking("10:00"), booking("21:45")], new Map(), IST);
    expect(result).toEqual([]);
  });

  it("flags bookings after an earlier closing time", () => {
    const result = findStrandedBookings(schedule({ weeklyHours: hours({ opensAt: "10:00", closesAt: "21:00" }) }), [booking("20:45"), booking("21:15")], new Map(), IST);
    expect(result).toEqual([{ reference: "RS4V-21:15", date: DATE, time: "21:15" }]);
  });

  it("flags bookings on a day that is now closed", () => {
    expect(findStrandedBookings(schedule({ weeklyHours: hours(null) }), [booking("12:00")], new Map(), IST)).toHaveLength(1);
  });

  it("flags bookings that no longer start on a slot when the slot length changes", () => {
    const result = findStrandedBookings(schedule({ slotMinutes: 30 }), [booking("10:30"), booking("10:15")], new Map(), IST);
    expect(result.map((r) => r.time)).toEqual(["10:15"]);
  });

  it("checks a dated override instead of the weekly hours", () => {
    const closedWeekly = schedule({ weeklyHours: hours(null) });
    const overrides = new Map([[DATE, { closed: false, opensAt: "11:00", closesAt: "14:00" }]]);
    expect(findStrandedBookings(closedWeekly, [booking("12:00")], overrides, IST)).toEqual([]);
  });
});
