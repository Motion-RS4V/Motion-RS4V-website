import { z } from "zod";

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Day = (typeof DAYS)[number];

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour time, like 10:00 or 21:45");
const paise = z.number().int().nonnegative();
const wholeMinutes = z.number().int().nonnegative();

/** Opening hours for one weekday; null means closed all day. */
const dayHoursSchema = z
  .object({ opensAt: time, closesAt: time })
  .refine((h) => h.opensAt < h.closesAt, { message: "Closing time must be after opening time", path: ["closesAt"] })
  .nullable();

export const venueSchema = z.object({
  name: z.string().min(1),
  /** The registered business behind the venue, shown on the terms, privacy and refund pages. Empty means use `name`. */
  legalName: z.string().max(120),
  timezone: z.string().min(1),
  address: z.string(),
  mapsUrl: z.union([z.url(), z.literal("")]),
  whatsappNumber: z.string(),
  email: z.union([z.email(), z.literal("")]),
  instagramHandle: z.string(),
});

export const scheduleSchema = z
  .object({
    weeklyHours: z.object({
      mon: dayHoursSchema,
      tue: dayHoursSchema,
      wed: dayHoursSchema,
      thu: dayHoursSchema,
      fri: dayHoursSchema,
      sat: dayHoursSchema,
      sun: dayHoursSchema,
    }),
    slotMinutes: z.number().int().min(5).max(120),
    driveMinutes: z.number().int().min(1).max(120),
    bookingWindowDays: z.number().int().min(1).max(365),
    /** Customers are asked to arrive this many minutes before their session. */
    arriveEarlyMinutes: wholeMinutes,
    /** Online booking closes this many minutes before a slot starts. Staff can still sell walk-ins. */
    onlineCutoffMinutes: wholeMinutes,
  })
  .refine((s) => s.driveMinutes <= s.slotMinutes, {
    message: "Drive time can't be longer than the slot",
    path: ["driveMinutes"],
  });

export const pricingRuleSchema = z
  .object({
    label: z.string().min(1), // "Weekend"
    days: z.array(z.enum(DAYS)).min(1),
    from: time.optional(), // applies to slots starting at or after this time
    to: time.optional(), // and before this time
    pricePaise: paise.min(100),
  })
  .refine((r) => !r.from || !r.to || r.from < r.to, { message: "End time must be after start time", path: ["to"] });

export const pricingSchema = z.object({
  basePricePaise: paise.min(100),
  pricesIncludeGst: z.boolean(),
  gstRatePercent: z.number().min(0).max(40),
  /** Later rules win when several match the same slot. */
  rules: z.array(pricingRuleSchema),
});

export const policySchema = z.object({
  /** Off stops new online bookings (checkout and the site's session picker). Staff sales and existing bookings carry on. */
  onlineBookingEnabled: z.boolean(),
  maxSeatsPerBooking: z.number().int().min(1),
  /** When on, a slot can't sell more seats for a track than there are Ready cars for that track. */
  limitSeatsByReadyCars: z.boolean(),
  paymentHoldMinutes: z.number().int().min(1).max(60),
  payAtVenueEnabled: z.boolean(),
  freeCancelHours: wholeMinutes,
  rescheduleCutoffMinutes: wholeMinutes,
  maxReschedules: wholeMinutes,
  noShowGraceMinutes: wholeMinutes,
});

export const eligibilitySchema = z.object({
  minAgeYears: wholeMinutes,
  minHeightCm: wholeMinutes,
});

export const settingsSchemas = {
  venue: venueSchema,
  schedule: scheduleSchema,
  pricing: pricingSchema,
  policy: policySchema,
  eligibility: eligibilitySchema,
} as const;

export type SettingsKey = keyof typeof settingsSchemas;
export const SETTINGS_KEYS = Object.keys(settingsSchemas) as SettingsKey[];

export type Settings = { [K in SettingsKey]: z.infer<(typeof settingsSchemas)[K]> };
export type DayHours = z.infer<typeof dayHoursSchema>;
export type PricingRule = z.infer<typeof pricingRuleSchema>;
