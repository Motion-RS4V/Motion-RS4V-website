import { describe, expect, it } from "vitest";
import type { PublicSlot } from "./public-types";
import { addMinutesToTime, decodeSeats, encodeSeats, periodOf, slotFits } from "./sessions";

const slot = (over: Partial<PublicSlot> = {}): PublicSlot => ({
  start: "2026-09-17T12:45:00.000Z",
  time: "18:15",
  pricePaise: 49_900,
  capacity: 4,
  seatsLeft: 3,
  seatsLeftByExperience: { track: 3, offroad: 1 },
  bookable: true,
  reason: null,
  ...over,
});

describe("session helpers", () => {
  it("checks a group against total and per-track seats", () => {
    expect(slotFits(slot(), { track: 2, offroad: 1 })).toBe(true);
    expect(slotFits(slot(), { offroad: 2 })).toBe(false);
    expect(slotFits(slot(), { track: 3, offroad: 1 })).toBe(false);
    expect(slotFits(slot({ bookable: false }), { track: 1 })).toBe(false);
  });

  it("round-trips the seat mix through the URL and rejects junk", () => {
    expect(decodeSeats(encodeSeats({ track: 2, offroad: 1, karting: 0 }))).toEqual({ track: 2, offroad: 1 });
    expect(decodeSeats("track:0")).toBeNull();
    expect(decodeSeats("track:2;drop table")).toBeNull();
    expect(decodeSeats("")).toBeNull();
  });

  it("does clock arithmetic and buckets times into parts of the day", () => {
    expect(addMinutesToTime("21:45", 15)).toBe("22:00");
    expect([periodOf("11:45"), periodOf("12:00"), periodOf("17:00")]).toEqual(["Morning", "Afternoon", "Evening"]);
  });
});
