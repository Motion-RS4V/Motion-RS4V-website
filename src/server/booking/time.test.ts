import { describe, expect, it } from "vitest";
import { addDays, dayOfWeek, isLocalDate, localToUtc, offsetMinutes, utcToLocal } from "./time";

const IST = "Asia/Kolkata";

describe("venue time", () => {
  it("converts IST wall-clock time to UTC and back", () => {
    const utc = localToUtc("2026-09-19", "18:15", IST);
    expect(utc.toISOString()).toBe("2026-09-19T12:45:00.000Z");
    expect(utcToLocal(utc, IST)).toEqual({ date: "2026-09-19", time: "18:15", day: "sat" });
  });

  it("handles times that cross midnight UTC", () => {
    expect(localToUtc("2026-09-20", "02:00", IST).toISOString()).toBe("2026-09-19T20:30:00.000Z");
  });

  it("knows IST is UTC+5:30", () => {
    expect(offsetMinutes(new Date("2026-01-01T00:00:00Z"), IST)).toBe(330);
  });

  it("stays correct in a zone with daylight saving", () => {
    // New York jumps from UTC-5 to UTC-4 on 8 March 2026.
    expect(localToUtc("2026-03-07", "18:00", "America/New_York").toISOString()).toBe("2026-03-07T23:00:00.000Z");
    expect(localToUtc("2026-03-09", "18:00", "America/New_York").toISOString()).toBe("2026-03-09T22:00:00.000Z");
  });

  it("does date arithmetic on calendar days", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(dayOfWeek("2026-09-15")).toBe("tue");
  });

  it("rejects impossible dates", () => {
    expect(isLocalDate("2026-09-19")).toBe(true);
    expect(isLocalDate("2026-02-30")).toBe(false);
    expect(isLocalDate("19-09-2026")).toBe(false);
  });
});
