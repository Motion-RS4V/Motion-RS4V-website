import "server-only";

import type { PublicDay, SiteContent } from "@/lib/public-types";
import type { DayAvailability } from "@/server/booking";
import { db } from "@/server/db";
import { loadSettings } from "@/server/settings";

/** Everything the public pages need from settings and the venue tables. Values only; no internal ids. */
export async function getSiteContent(): Promise<SiteContent> {
  const settings = await loadSettings(db);
  const experiences = await db.experience.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { code: true, name: true, trackLabel: true, tagline: true },
  });

  return {
    venue: settings.venue,
    weeklyHours: settings.schedule.weeklyHours,
    basePricePaise: settings.pricing.basePricePaise,
    hasPriceRules: settings.pricing.rules.length > 0,
    driveMinutes: settings.schedule.driveMinutes,
    slotMinutes: settings.schedule.slotMinutes,
    arriveEarlyMinutes: settings.schedule.arriveEarlyMinutes,
    maxSeatsPerBooking: settings.policy.maxSeatsPerBooking,
    bookingWindowDays: settings.schedule.bookingWindowDays,
    onlineBookingEnabled: settings.policy.onlineBookingEnabled,
    freeCancelHours: settings.policy.freeCancelHours,
    minAgeYears: settings.eligibility.minAgeYears,
    minHeightCm: settings.eligibility.minHeightCm,
    experiences,
  };
}

/** Public view of a day: seats left, not how many are sold or why capacity changed. */
export function toPublicDay(day: DayAvailability): PublicDay {
  return {
    date: day.date,
    hours: day.hours,
    slots: day.slots.map((s) => ({
      start: s.start.toISOString(),
      time: s.localTime,
      pricePaise: s.unitPricePaise,
      capacity: s.availability.total.capacity,
      seatsLeft: s.availability.total.available,
      seatsLeftByExperience: Object.fromEntries(
        Object.entries(s.availability.byExperience).map(([code, count]) => [code, count.available]),
      ),
      bookable: s.bookable,
      reason: s.unavailableReason,
    })),
  };
}
