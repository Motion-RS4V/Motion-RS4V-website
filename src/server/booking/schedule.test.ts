import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/server/settings";
import { findSlot, generateSlots, hoursForDate } from "./schedule";
import { localToUtc } from "./time";

const IST = "Asia/Kolkata";
const schedule = DEFAULT_SETTINGS.schedule;

describe("schedule", () => {
  it("fills 10:00–22:00 with 48 fifteen-minute slots", () => {
    const slots = generateSlots("2026-09-19", { opensAt: "10:00", closesAt: "22:00" }, 15, IST);
    expect(slots).toHaveLength(48);
    expect(slots[0].localTime).toBe("10:00");
    expect(slots.at(-1)!.localTime).toBe("21:45");
    expect(slots[0].end.getTime() - slots[0].start.getTime()).toBe(15 * 60_000);
  });

  it("never lets a slot run past closing", () => {
    const slots = generateSlots("2026-09-19", { opensAt: "10:00", closesAt: "21:50" }, 15, IST);
    expect(slots.at(-1)!.localTime).toBe("21:30");
  });

  it("uses the weekly hours unless a dated override says otherwise", () => {
    expect(hoursForDate(schedule, null, "2026-09-19")).toEqual({ opensAt: "10:00", closesAt: "22:00" });
    expect(hoursForDate(schedule, { closed: true, opensAt: null, closesAt: null }, "2026-09-19")).toBeNull();
    expect(hoursForDate(schedule, { closed: false, opensAt: "12:00", closesAt: "23:30" }, "2026-09-19")).toEqual({
      opensAt: "12:00",
      closesAt: "23:30",
    });
  });

  it("ignores a malformed override instead of guessing", () => {
    expect(hoursForDate(schedule, { closed: false, opensAt: "23:00", closesAt: "09:00" }, "2026-09-19")).toEqual({
      opensAt: "10:00",
      closesAt: "22:00",
    });
  });

  it("honours a closed weekday", () => {
    const closedMondays = { ...schedule, weeklyHours: { ...schedule.weeklyHours, mon: null } };
    expect(hoursForDate(closedMondays, null, "2026-09-21")).toBeNull();
  });

  it("only finds slots that are really on the timetable", () => {
    expect(findSlot(localToUtc("2026-09-19", "18:15", IST), schedule, null, IST)?.localTime).toBe("18:15");
    expect(findSlot(localToUtc("2026-09-19", "18:07", IST), schedule, null, IST)).toBeNull();
    expect(findSlot(localToUtc("2026-09-19", "22:00", IST), schedule, null, IST)).toBeNull();
    expect(findSlot(localToUtc("2026-09-19", "09:45", IST), schedule, null, IST)).toBeNull();
  });
});
