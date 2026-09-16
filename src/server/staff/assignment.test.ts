import { describe, expect, it } from "vitest";
import { pickAssignments } from "./assignment";

const rigs = [
  { id: "r1", label: "Rig 1", sortOrder: 1 },
  { id: "r2", label: "Rig 2", sortOrder: 2 },
  { id: "r3", label: "Rig 3", sortOrder: 3 },
];

describe("automatic rig and car assignment", () => {
  it("gives every driver a rig and a car for their own track", () => {
    const result = pickAssignments({
      seats: [
        { seatId: "s1", experienceCode: "track" },
        { seatId: "s2", experienceCode: "offroad" },
      ],
      freeRigs: rigs,
      freeCarsByExperience: {
        track: [{ id: "T1", label: "T1", recentUses: 3 }],
        offroad: [{ id: "O2", label: "O2", recentUses: 1 }],
      },
    });
    expect(result).toEqual([
      { seatId: "s1", rigId: "r1", carId: "T1", missing: null },
      { seatId: "s2", rigId: "r2", carId: "O2", missing: null },
    ]);
  });

  it("spreads wear by picking the least-used car first, then by label", () => {
    const result = pickAssignments({
      seats: [
        { seatId: "s1", experienceCode: "track" },
        { seatId: "s2", experienceCode: "track" },
      ],
      freeRigs: rigs,
      freeCarsByExperience: {
        track: [
          { id: "T1", label: "T1", recentUses: 9 },
          { id: "T4", label: "T4", recentUses: 2 },
          { id: "T2", label: "T2", recentUses: 2 },
        ],
      },
    });
    expect(result.map((r) => r.carId)).toEqual(["T2", "T4"]);
  });

  it("never gives the same rig or car to two drivers", () => {
    const result = pickAssignments({
      seats: [
        { seatId: "s1", experienceCode: "track" },
        { seatId: "s2", experienceCode: "track" },
      ],
      freeRigs: rigs,
      freeCarsByExperience: { track: [{ id: "T1", label: "T1", recentUses: 0 }] },
    });
    expect(result[0]).toMatchObject({ rigId: "r1", carId: "T1", missing: null });
    expect(result[1]).toMatchObject({ rigId: "r2", carId: null, missing: "CAR" });
  });

  it("flags when the rigs run out", () => {
    const result = pickAssignments({
      seats: [
        { seatId: "s1", experienceCode: "track" },
        { seatId: "s2", experienceCode: "track" },
      ],
      freeRigs: [rigs[0]],
      freeCarsByExperience: { track: [{ id: "T1", label: "T1", recentUses: 0 }, { id: "T2", label: "T2", recentUses: 0 }] },
    });
    expect(result[1]).toMatchObject({ rigId: null, missing: "RIG" });
  });
});
