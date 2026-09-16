import { describe, expect, it } from "vitest";
import { localToUtc } from "@/server/booking/time";
import { DEFAULT_SETTINGS } from "@/server/settings";
import { capacityCells, change, daysInRange, summariseRevenue, summariseSeats, summariseSources } from "./analytics";

const IST = "Asia/Kolkata";
const at = (date: string, time: string) => localToUtc(date, time, IST);
// 2099-08-10 is a Monday. Default hours: 10:00–22:00, 15-minute sessions → 48 sessions a day.
const capacity = { schedule: DEFAULT_SETTINGS.schedule, overrides: new Map(), rigs: 4, timezone: IST };

describe("summariseRevenue", () => {
  it("buckets money by the venue day it moved and nets refunds", () => {
    const r = summariseRevenue(
      "2099-08-10",
      "2099-08-11",
      [
        { method: "RAZORPAY", amountPaise: 100_00, capturedAt: at("2099-08-10", "23:30") }, // 18:00 UTC, still the 10th locally
        { method: "CASH", amountPaise: 50_00, capturedAt: at("2099-08-11", "00:10") }, // the 11th locally, the 10th in UTC
        { method: "RAZORPAY", amountPaise: 999_00, capturedAt: at("2099-08-12", "10:00") }, // outside the range
      ],
      [
        { amountPaise: 20_00, at: at("2099-08-11", "12:00"), method: "RAZORPAY", pending: true },
        { amountPaise: 10_00, at: at("2099-08-11", "13:00"), method: "CASH", pending: false },
      ],
      IST,
    );
    expect(r.days).toEqual([
      { date: "2099-08-10", onlinePaise: 100_00, deskPaise: 0, refundedPaise: 0, netPaise: 100_00 },
      { date: "2099-08-11", onlinePaise: 0, deskPaise: 50_00, refundedPaise: 30_00, netPaise: 20_00 },
    ]);
    expect(r).toMatchObject({ onlinePaise: 100_00, deskPaise: 50_00, collectedPaise: 150_00, refundedPaise: 30_00, refundPendingPaise: 20_00, netPaise: 120_00 });
  });
});

describe("capacity and seats", () => {
  it("counts every session × working rig, and nothing on a closed date", () => {
    const cells = capacityCells("2099-08-10", "2099-08-10", capacity);
    expect([...cells.values()].reduce((t, n) => t + n, 0)).toBe(48 * 4);
    expect(cells.get("mon:10")).toBe(16); // 4 sessions in the hour × 4 rigs

    const closed = capacityCells("2099-08-10", "2099-08-10", { ...capacity, overrides: new Map([["2099-08-10", { closed: true, opensAt: null, closesAt: null }]]) });
    expect(closed.size).toBe(0);
  });

  it("counts no-shows as sold, keeps cancellations apart, and fills the heatmap", () => {
    const seat = (status: "BOOKED" | "NO_SHOW" | "CANCELLED" | "COMPLETED", code: string, channel: "ONLINE" | "WALK_IN", time: string) => ({
      status,
      experienceCode: code,
      channel,
      slotStart: at("2099-08-10", time),
    });
    const s = summariseSeats(
      "2099-08-10",
      "2099-08-10",
      [seat("COMPLETED", "track", "ONLINE", "18:00"), seat("NO_SHOW", "track", "ONLINE", "18:15"), seat("BOOKED", "offroad", "WALK_IN", "18:30"), seat("CANCELLED", "track", "ONLINE", "18:00")],
      capacity,
    );
    expect(s).toMatchObject({ sold: 3, checkedIn: 1, noShows: 1, cancelled: 1, walkIns: 1, capacity: 192 });
    expect(s.byExperience).toEqual([
      { code: "track", seats: 2 },
      { code: "offroad", seats: 1 },
    ]);
    const evening = s.heat.find((c) => c.day === "mon" && c.hour === 18)!;
    expect(evening).toMatchObject({ sold: 3, capacity: 16 });
    expect(evening.share).toBeCloseTo(3 / 16);
    expect(s.hours[0]).toBe(10);
    expect(s.hours.at(-1)).toBe(21);
  });
});

describe("sources and helpers", () => {
  it("prefers utm_source, then the referrer's site, then Direct", () => {
    expect(
      summariseSources([
        { utmSource: "Instagram", referrer: "https://google.com" },
        { utmSource: null, referrer: "https://www.google.com/search?q=rs4v" },
        { utmSource: null, referrer: null },
        { utmSource: "instagram", referrer: null },
        { utmSource: null, referrer: "not a url" },
      ]),
    ).toEqual([
      { source: "instagram", bookings: 2 },
      { source: "Direct", bookings: 2 },
      { source: "google.com", bookings: 1 },
    ]);
  });

  it("measures ranges and changes", () => {
    expect(daysInRange("2099-08-01", "2099-08-30")).toBe(30);
    expect(change(150, 100)).toBeCloseTo(0.5);
    expect(change(5, 0)).toBeNull();
  });
});
