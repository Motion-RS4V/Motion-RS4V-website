import type { Day } from "@/server/settings";

/**
 * Venue-local time helpers. Everything is stored in UTC; the venue thinks in local dates ("2026-09-19")
 * and wall-clock times ("18:15"). Works for any IANA timezone, including ones with daylight saving.
 */

const WEEKDAYS: Day[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MINUTE = 60_000;

export type LocalDate = string; // YYYY-MM-DD
export type LocalTime = string; // HH:MM

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(tz, f);
  }
  return f;
}

function parts(instant: Date, tz: string) {
  const p: Record<string, string> = {};
  for (const { type, value } of formatter(tz).formatToParts(instant)) p[type] = value;
  return p;
}

/** Minutes the zone is ahead of UTC at that instant (IST = 330). */
export function offsetMinutes(instant: Date, tz: string): number {
  const p = parts(instant, tz);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / MINUTE);
}

export function localToUtc(date: LocalDate, time: LocalTime, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  const first = offsetMinutes(new Date(wall), tz);
  const utc = wall - first * MINUTE;
  const second = offsetMinutes(new Date(utc), tz);
  return new Date(second === first ? utc : wall - second * MINUTE);
}

export function utcToLocal(instant: Date, tz: string): { date: LocalDate; time: LocalTime; day: Day } {
  const p = parts(instant, tz);
  const date = `${p.year}-${p.month}-${p.day}`;
  return { date, time: `${p.hour}:${p.minute}`, day: dayOfWeek(date) };
}

export function dayOfWeek(date: LocalDate): Day {
  const [y, m, d] = date.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function timeToMinutes(time: LocalTime): number {
  const [hh, mm] = time.split(":").map(Number);
  return hh * 60 + mm;
}

export function minutesToTime(minutes: number): LocalTime {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * MINUTE);
}

export function isLocalDate(value: string): value is LocalDate {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && addDays(value, 0) === value;
}
