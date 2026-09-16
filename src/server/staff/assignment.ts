/**
 * Picks a rig and a car for each driver at check-in.
 * Pure so it can be tested on its own: the caller supplies what's free in that session.
 * Cars are chosen least-used-first, so the fleet wears evenly instead of one car doing every session.
 */

export type SeatToAssign = { seatId: string; experienceCode: string };
export type FreeRig = { id: string; label: string; sortOrder: number };
export type FreeCar = { id: string; label: string; recentUses: number };

export type Assignment = { seatId: string; rigId: string | null; carId: string | null; missing: "RIG" | "CAR" | null };

export function pickAssignments(input: {
  seats: SeatToAssign[];
  freeRigs: FreeRig[];
  freeCarsByExperience: Record<string, FreeCar[]>;
}): Assignment[] {
  const rigs = [...input.freeRigs].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
  const cars = new Map<string, FreeCar[]>(
    Object.entries(input.freeCarsByExperience).map(([code, list]) => [
      code,
      [...list].sort((a, b) => a.recentUses - b.recentUses || a.label.localeCompare(b.label)),
    ]),
  );

  return input.seats.map((seat) => {
    const rig = rigs.shift() ?? null;
    const car = cars.get(seat.experienceCode)?.shift() ?? null;
    return {
      seatId: seat.seatId,
      rigId: rig?.id ?? null,
      carId: car?.id ?? null,
      missing: !rig ? "RIG" : !car ? "CAR" : null,
    };
  });
}
