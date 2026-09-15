import { describe, expect, it } from "vitest";
import { checkFit, computeAvailability, type SlotInventory } from "./capacity";

// The venue today: 4 rigs, 4 racing-track cars, 4 off-road cars.
const venue = (over: Partial<SlotInventory> = {}): SlotInventory => ({
  activeRigs: 4,
  blockedRigs: 0,
  venueBlocked: false,
  readyCars: { track: 4, offroad: 4 },
  bookedSeats: {},
  ...over,
});

describe("capacity", () => {
  it("sells up to 4 seats in any mix of tracks", () => {
    const av = computeAvailability(venue(), true);
    expect(av.total).toEqual({ capacity: 4, booked: 0, available: 4 });
    expect(checkFit(av, { track: 4 })).toEqual({ ok: true });
    expect(checkFit(av, { offroad: 4 })).toEqual({ ok: true });
    expect(checkFit(av, { track: 2, offroad: 2 })).toEqual({ ok: true });
    expect(checkFit(av, { track: 3, offroad: 2 })).toMatchObject({ ok: false, code: "SLOT_FULL", available: 4 });
  });

  it("counts seats already sold across both tracks against the rigs", () => {
    const av = computeAvailability(venue({ bookedSeats: { track: 3 } }), true);
    expect(av.total.available).toBe(1);
    expect(av.byExperience.offroad.available).toBe(1);
    expect(checkFit(av, { offroad: 2 })).toMatchObject({ ok: false, code: "SLOT_FULL" });
  });

  it("limits a track to its Ready cars when cars are under repair", () => {
    const av = computeAvailability(venue({ readyCars: { track: 4, offroad: 1 } }), true);
    expect(av.byExperience.offroad).toEqual({ capacity: 1, booked: 0, available: 1 });
    expect(checkFit(av, { offroad: 2 })).toMatchObject({ ok: false, code: "EXPERIENCE_FULL", experience: "offroad", available: 1 });
    expect(checkFit(av, { track: 3, offroad: 1 })).toEqual({ ok: true });
  });

  it("ignores cars when the owner turns the car limit off", () => {
    const av = computeAvailability(venue({ readyCars: { track: 4, offroad: 1 } }), false);
    expect(checkFit(av, { offroad: 3 })).toEqual({ ok: true });
  });

  it("takes blocked rigs out of sale, and a venue block closes the slot", () => {
    expect(computeAvailability(venue({ blockedRigs: 1 }), true).total.capacity).toBe(3);
    expect(computeAvailability(venue({ activeRigs: 3 }), true).total.capacity).toBe(3);
    const closed = computeAvailability(venue({ venueBlocked: true }), true);
    expect(closed.total.available).toBe(0);
    expect(checkFit(closed, { track: 1 })).toMatchObject({ ok: false });
  });

  it("never reports negative availability after capacity drops below sales", () => {
    const av = computeAvailability(venue({ activeRigs: 2, bookedSeats: { track: 3 } }), true);
    expect(av.total.available).toBe(0);
    expect(av.byExperience.track.available).toBe(0);
  });

  it("refuses experiences that aren't on sale", () => {
    expect(checkFit(computeAvailability(venue(), true), { karting: 1 })).toEqual({
      ok: false,
      code: "UNKNOWN_EXPERIENCE",
      experience: "karting",
    });
  });
});
