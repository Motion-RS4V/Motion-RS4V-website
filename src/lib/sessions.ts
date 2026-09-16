import type { PublicSlot } from "./public-types";

/** Drivers per experience code, e.g. { track: 2, offroad: 1 }. */
export type SeatCounts = Record<string, number>;

export const PERIODS = ["Morning", "Afternoon", "Evening"] as const;
export type Period = (typeof PERIODS)[number];

export function totalSeats(counts: SeatCounts): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

/** Whether a group with this mix of tracks can be sold into the slot right now. */
export function slotFits(slot: PublicSlot, counts: SeatCounts): boolean {
  if (!slot.bookable || totalSeats(counts) > slot.seatsLeft) return false;
  return Object.entries(counts).every(([code, n]) => n <= (slot.seatsLeftByExperience[code] ?? 0));
}

export function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const t = h * 60 + m + minutes;
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export function periodOf(time: string): Period {
  const hour = Number(time.slice(0, 2));
  return hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
}

/** "track:2,offroad:1" ⇄ { track: 2, offroad: 1 }, used in the /book URL. */
export function encodeSeats(counts: SeatCounts): string {
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([code, n]) => `${code}:${n}`)
    .join(",");
}

export function decodeSeats(value: string | null | undefined): SeatCounts | null {
  if (!value) return null;
  const counts: SeatCounts = {};
  for (const part of value.split(",")) {
    const match = part.match(/^([a-z0-9-]{1,40}):([1-9]\d?)$/);
    if (!match) return null;
    counts[match[1]] = (counts[match[1]] ?? 0) + Number(match[2]);
  }
  return Object.keys(counts).length ? counts : null;
}
