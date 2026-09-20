import type { Settings } from "./schema";

const DAILY = { opensAt: "10:00", closesAt: "22:00" };

/**
 * Seeded on first run and used for any group the owner hasn't saved yet.
 * The owner console edits the stored copies; changing this file never alters a live venue's settings.
 */
export const DEFAULT_SETTINGS: Settings = {
  venue: {
    name: "Motion RS4V",
    legalName: "",
    timezone: "Asia/Kolkata",
    address: "Zora The Mall, Raipur",
    mapsUrl: "",
    whatsappNumber: "",
    email: "",
    instagramHandle: "",
  },
  schedule: {
    weeklyHours: { mon: DAILY, tue: DAILY, wed: DAILY, thu: DAILY, fri: DAILY, sat: DAILY, sun: DAILY },
    slotMinutes: 15,
    driveMinutes: 10,
    bookingWindowDays: 30,
    onlineCutoffMinutes: 10,
    arriveEarlyMinutes: 10,
  },
  pricing: {
    basePricePaise: 49_900,
    pricesIncludeGst: true,
    gstRatePercent: 18, // confirm the applicable rate with the venue's accountant
    rules: [],
  },
  policy: {
    onlineBookingEnabled: true,
    maxSeatsPerBooking: 4,
    limitSeatsByReadyCars: true,
    paymentHoldMinutes: 10,
    payAtVenueEnabled: false,
    freeCancelHours: 2,
    rescheduleCutoffMinutes: 30,
    maxReschedules: 1,
    noShowGraceMinutes: 5,
  },
  kiosk: {
    enabled: false,
    paymentHoldMinutes: 3,
    idleResetSeconds: 60,
  },
  eligibility: {
    minAgeYears: 10,
    minHeightCm: 130,
  },
};
