import type { Day, Settings } from "@/server/settings";
import type { LocalTime } from "./time";

export type SlotPrice = { unitPricePaise: number; ruleLabel: string | null };

/** Base price unless a rule matches the slot's weekday and start time. Later rules win. */
export function priceForSlot(pricing: Settings["pricing"], day: Day, time: LocalTime): SlotPrice {
  let result: SlotPrice = { unitPricePaise: pricing.basePricePaise, ruleLabel: null };
  for (const rule of pricing.rules) {
    if (!rule.days.includes(day)) continue;
    if (rule.from && time < rule.from) continue;
    if (rule.to && time >= rule.to) continue;
    result = { unitPricePaise: rule.pricePaise, ruleLabel: rule.label };
  }
  return result;
}

export type Quote = {
  unitPricePaise: number;
  seats: number;
  subtotalPaise: number; // unit price × seats, as configured
  gstPaise: number;
  totalPaise: number; // what the customer pays
};

export function quote(pricing: Settings["pricing"], unitPricePaise: number, seats: number): Quote {
  const subtotalPaise = unitPricePaise * seats;
  const rate = pricing.gstRatePercent;
  if (pricing.pricesIncludeGst) {
    const net = Math.round((subtotalPaise * 100) / (100 + rate));
    return { unitPricePaise, seats, subtotalPaise, gstPaise: subtotalPaise - net, totalPaise: subtotalPaise };
  }
  const gstPaise = Math.round((subtotalPaise * rate) / 100);
  return { unitPricePaise, seats, subtotalPaise, gstPaise, totalPaise: subtotalPaise + gstPaise };
}
