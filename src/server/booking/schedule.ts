import type { Settings } from "@/server/settings";
import { addMinutes, dayOfWeek, localToUtc, minutesToTime, timeToMinutes, utcToLocal, type LocalDate, type LocalTime } from "./time";

export type OpeningHours = { opensAt: LocalTime; closesAt: LocalTime } | null;

export type ScheduleOverrideInput = {
  closed: boolean;
  opensAt: string | null;
  closesAt: string | null;
} | null;

export type Slot = {
  start: Date;
  end: Date;
  localDate: LocalDate;
  localTime: LocalTime;
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A dated override beats the weekly hours. A malformed override is ignored rather than guessed at. */
export function hoursForDate(
  schedule: Settings["schedule"],
  override: ScheduleOverrideInput,
  date: LocalDate,
): OpeningHours {
  if (override) {
    if (override.closed) return null;
    const { opensAt, closesAt } = override;
    if (opensAt && closesAt && HHMM.test(opensAt) && HHMM.test(closesAt) && opensAt < closesAt) {
      return { opensAt, closesAt };
    }
  }
  return schedule.weeklyHours[dayOfWeek(date)];
}

/** Every slot that fits entirely inside opening hours. A 21:50 close with 15-minute slots ends at 21:30–21:45. */
export function generateSlots(date: LocalDate, hours: OpeningHours, slotMinutes: number, tz: string): Slot[] {
  if (!hours) return [];
  const slots: Slot[] = [];
  const close = timeToMinutes(hours.closesAt);
  for (let t = timeToMinutes(hours.opensAt); t + slotMinutes <= close; t += slotMinutes) {
    const localTime = minutesToTime(t);
    const start = localToUtc(date, localTime, tz);
    slots.push({ start, end: addMinutes(start, slotMinutes), localDate: date, localTime });
  }
  return slots;
}

/** Finds the slot starting exactly at `start`, or null if that instant isn't a real session. */
export function findSlot(
  start: Date,
  schedule: Settings["schedule"],
  override: ScheduleOverrideInput,
  tz: string,
): Slot | null {
  const { date } = utcToLocal(start, tz);
  const slots = generateSlots(date, hoursForDate(schedule, override, date), schedule.slotMinutes, tz);
  return slots.find((s) => s.start.getTime() === start.getTime()) ?? null;
}
