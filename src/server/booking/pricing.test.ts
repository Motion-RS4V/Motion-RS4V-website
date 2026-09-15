import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Settings } from "@/server/settings";
import { priceForSlot, quote } from "./pricing";

const base = DEFAULT_SETTINGS.pricing;
const withRules: Settings["pricing"] = {
  ...base,
  rules: [
    { label: "Weekend", days: ["sat", "sun"], pricePaise: 59_900 },
    { label: "Weekend evening", days: ["sat", "sun"], from: "18:00", pricePaise: 69_900 },
    { label: "Weekday morning", days: ["mon", "tue", "wed", "thu", "fri"], to: "12:00", pricePaise: 39_900 },
  ],
};

describe("pricing", () => {
  it("charges the base price when no rule matches", () => {
    expect(priceForSlot(base, "sat", "18:00")).toEqual({ unitPricePaise: 49_900, ruleLabel: null });
    expect(priceForSlot(withRules, "tue", "15:00").unitPricePaise).toBe(49_900);
  });

  it("applies day and time rules, with later rules winning", () => {
    expect(priceForSlot(withRules, "sat", "11:00")).toEqual({ unitPricePaise: 59_900, ruleLabel: "Weekend" });
    expect(priceForSlot(withRules, "sun", "18:00")).toEqual({ unitPricePaise: 69_900, ruleLabel: "Weekend evening" });
    expect(priceForSlot(withRules, "wed", "11:45").unitPricePaise).toBe(39_900);
    expect(priceForSlot(withRules, "wed", "12:00").unitPricePaise).toBe(49_900);
  });

  it("splits GST out of GST-inclusive prices", () => {
    const q = quote(base, 49_900, 2);
    expect(q.totalPaise).toBe(99_800);
    expect(q.gstPaise).toBe(15_224);
    expect(q.subtotalPaise).toBe(99_800);
  });

  it("adds GST on top when prices exclude it", () => {
    const q = quote({ ...base, pricesIncludeGst: false }, 49_900, 1);
    expect(q.gstPaise).toBe(8_982);
    expect(q.totalPaise).toBe(58_882);
  });
});
