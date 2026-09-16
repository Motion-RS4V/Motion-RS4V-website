import { shortDate } from "@/lib/venue-time";
import { utcToLocal } from "./time";

/** "Thu 17 Sep 2026" and "18:15 – 18:30" in the venue's timezone. */
export function sessionLabels(slotStart: Date, slotEnd: Date, tz: string): { dateLabel: string; timeLabel: string } {
  const start = utcToLocal(slotStart, tz);
  const end = utcToLocal(slotEnd, tz);
  return {
    dateLabel: `${shortDate(start.date).label} ${start.date.slice(0, 4)}`,
    timeLabel: `${start.time} – ${end.time}`,
  };
}
