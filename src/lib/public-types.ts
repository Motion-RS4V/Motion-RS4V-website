/** Shapes shared between the server and the public site's browser code. No server imports here. */

import type { WeeklyHours } from "./venue-time";

export type PublicExperience = {
  code: string;
  name: string;
  trackLabel: string;
  tagline: string;
};

export type SiteContent = {
  venue: {
    name: string;
    legalName: string;
    timezone: string;
    address: string;
    mapsUrl: string;
    whatsappNumber: string;
    email: string;
    instagramHandle: string;
  };
  weeklyHours: WeeklyHours;
  basePricePaise: number;
  hasPriceRules: boolean;
  driveMinutes: number;
  slotMinutes: number;
  arriveEarlyMinutes: number;
  maxSeatsPerBooking: number;
  bookingWindowDays: number;
  onlineBookingEnabled: boolean;
  freeCancelHours: number;
  minAgeYears: number;
  minHeightCm: number;
  experiences: PublicExperience[];
};

export type PublicSlot = {
  start: string; // ISO instant
  time: string; // venue-local HH:MM
  pricePaise: number;
  capacity: number; // seats a slot can sell right now (working rigs)
  seatsLeft: number;
  seatsLeftByExperience: Record<string, number>;
  bookable: boolean;
  reason: "PAST" | "ONLINE_CLOSED" | "OUTSIDE_WINDOW" | "FULL" | null;
};

export type PublicDay = {
  date: string;
  hours: { opensAt: string; closesAt: string } | null;
  slots: PublicSlot[];
};
