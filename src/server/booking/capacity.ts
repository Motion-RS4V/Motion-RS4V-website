/**
 * Seat maths for one slot. Pure: the caller supplies counts read inside the booking transaction.
 *
 * Two limits apply together:
 *   1. Total seats ≤ working rigs (active, not blocked for this slot).
 *   2. Seats per track ≤ Ready cars for that track (when `limitSeatsByReadyCars` is on).
 */

export type SlotInventory = {
  activeRigs: number;
  blockedRigs: number; // active rigs taken out of sale for this slot
  venueBlocked: boolean; // whole-venue block overlaps this slot
  readyCars: Record<string, number>; // by experience code; only bookable experiences appear here
  bookedSeats: Record<string, number>; // held or sold seats by experience code
};

export type SeatCount = { capacity: number; booked: number; available: number };

export type SlotAvailability = {
  total: SeatCount;
  byExperience: Record<string, SeatCount>;
};

export type FitResult =
  | { ok: true }
  | { ok: false; code: "UNKNOWN_EXPERIENCE"; experience: string }
  | { ok: false; code: "SLOT_FULL"; available: number }
  | { ok: false; code: "EXPERIENCE_FULL"; experience: string; available: number };

export function computeAvailability(inv: SlotInventory, limitByCars: boolean): SlotAvailability {
  const totalCapacity = inv.venueBlocked ? 0 : Math.max(0, inv.activeRigs - inv.blockedRigs);
  const totalBooked = Object.values(inv.bookedSeats).reduce((a, b) => a + b, 0);
  const totalAvailable = Math.max(0, totalCapacity - totalBooked);

  const byExperience: Record<string, SeatCount> = {};
  for (const [code, cars] of Object.entries(inv.readyCars)) {
    const capacity = limitByCars ? Math.min(cars, totalCapacity) : totalCapacity;
    const booked = inv.bookedSeats[code] ?? 0;
    byExperience[code] = { capacity, booked, available: Math.max(0, Math.min(capacity - booked, totalAvailable)) };
  }

  return { total: { capacity: totalCapacity, booked: totalBooked, available: totalAvailable }, byExperience };
}

/** Can this mix of seats (e.g. { track: 2, offroad: 2 }) be sold in the slot right now? */
export function checkFit(availability: SlotAvailability, request: Record<string, number>): FitResult {
  let requested = 0;
  for (const [experience, count] of Object.entries(request)) {
    const exp = availability.byExperience[experience];
    if (!exp) return { ok: false, code: "UNKNOWN_EXPERIENCE", experience };
    if (count > exp.capacity - exp.booked) {
      return { ok: false, code: "EXPERIENCE_FULL", experience, available: Math.max(0, exp.capacity - exp.booked) };
    }
    requested += count;
  }
  if (requested > availability.total.available) {
    return { ok: false, code: "SLOT_FULL", available: availability.total.available };
  }
  return { ok: true };
}

export function countByExperience(codes: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of codes) out[c] = (out[c] ?? 0) + 1;
  return out;
}
