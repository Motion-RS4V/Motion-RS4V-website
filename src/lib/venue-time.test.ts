import { describe, expect, it } from "vitest";
import { addDays, openState, shortDate, uniformHours, venueNow, type WeeklyHours } from "./venue-time";

const IST = "Asia/Kolkata";
const daily = { opensAt: "10:00", closesAt: "22:00" };
const week: WeeklyHours = { mon: daily, tue: daily, wed: daily, thu: daily, fri: daily, sat: daily, sun: daily };
const at = (iso: string) => new Date(iso);

describe("venue clock (browser)", () => {
  it("reads the venue's date and time, not the visitor's", () => {
    expect(venueNow(IST, at("2026-09-15T19:00:00Z"))).toEqual({ date: "2026-09-16", time: "00:30", day: "wed" });
  });

  it("says open or closed with the next opening", () => {
    expect(openState(week, IST, at("2026-09-16T06:00:00Z")).label).toBe("Open now · until 22:00"); // 11:30
    expect(openState(week, IST, at("2026-09-16T03:00:00Z")).label).toBe("Closed now · opens 10:00"); // 08:30
    expect(openState(week, IST, at("2026-09-16T17:00:00Z")).label).toBe("Closed now · opens tomorrow 10:00"); // 22:30
  });

  it("skips closed days when saying when it opens next", () => {
    const closedThu = { ...week, thu: null };
    expect(openState(closedThu, IST, at("2026-09-16T17:00:00Z")).label).toBe("Closed now · opens Fri 10:00");
  });

  it("summarises identical hours and refuses to when days differ", () => {
    expect(uniformHours(week)).toBe("10:00 – 22:00");
    expect(uniformHours({ ...week, sun: { opensAt: "11:00", closesAt: "22:00" } })).toBeNull();
    expect(uniformHours({ ...week, mon: null })).toBeNull();
  });

  it("labels dates consistently", () => {
    expect(shortDate("2026-09-16")).toEqual({ weekday: "Wed", day: "16", month: "Sep", label: "Wed 16 Sep" });
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
