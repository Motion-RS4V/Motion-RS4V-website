import { findSlot, type ScheduleOverrideInput } from "@/server/booking/schedule";
import { utcToLocal, type LocalDate, type LocalTime } from "@/server/booking/time";
import type { Settings } from "@/server/settings";

export type UpcomingBooking = { reference: string; slotStart: Date };
export type StrandedBooking = { reference: string; date: LocalDate; time: LocalTime };

/**
 * Bookings whose start time isn't a slot under the proposed schedule.
 * Seats are counted per exact slot start, so a stranded booking would stop taking up capacity and its seats could sell twice.
 * Dated overrides still beat the weekly hours, exactly as they do when booking.
 */
export function findStrandedBookings(
  schedule: Settings["schedule"],
  bookings: UpcomingBooking[],
  overrides: Map<LocalDate, ScheduleOverrideInput>,
  timezone: string,
): StrandedBooking[] {
  const stranded: StrandedBooking[] = [];
  for (const booking of bookings) {
    const local = utcToLocal(booking.slotStart, timezone);
    if (findSlot(booking.slotStart, schedule, overrides.get(local.date) ?? null, timezone)) continue;
    stranded.push({ reference: booking.reference, date: local.date, time: local.time });
  }
  return stranded;
}
