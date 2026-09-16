import "server-only";

import type { Settings } from "@/server/settings";
import { requestSettings } from "@/server/settings/request";

/** Everything the terms, privacy and refund pages quote. Read from live settings so the pages always match what checkout enforces. */
export type PolicyFacts = {
  venue: Settings["venue"];
  operator: string;
  schedule: Pick<Settings["schedule"], "slotMinutes" | "driveMinutes" | "arriveEarlyMinutes" | "bookingWindowDays" | "onlineCutoffMinutes">;
  pricing: Pick<Settings["pricing"], "pricesIncludeGst" | "gstRatePercent">;
  policy: Pick<Settings["policy"], "maxSeatsPerBooking" | "paymentHoldMinutes" | "freeCancelHours" | "rescheduleCutoffMinutes" | "maxReschedules" | "noShowGraceMinutes">;
  eligibility: Settings["eligibility"];
};

export async function getPolicyFacts(): Promise<PolicyFacts> {
  const s = await requestSettings();
  return {
    venue: s.venue,
    operator: s.venue.legalName.trim() || s.venue.name,
    schedule: s.schedule,
    pricing: s.pricing,
    policy: s.policy,
    eligibility: s.eligibility,
  };
}
