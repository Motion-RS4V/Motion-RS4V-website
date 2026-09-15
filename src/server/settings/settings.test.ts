import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./defaults";
import { InvalidSettingsError, resolveSettings } from "./loader";
import { SETTINGS_KEYS, settingsSchemas } from "./schema";

describe("settings", () => {
  it("ships defaults that pass their own validation", () => {
    for (const key of SETTINGS_KEYS) {
      expect(settingsSchemas[key].safeParse(DEFAULT_SETTINGS[key]).success, key).toBe(true);
    }
  });

  it("uses defaults when nothing is stored", () => {
    expect(resolveSettings([])).toEqual(DEFAULT_SETTINGS);
  });

  it("lets stored fields override defaults without losing the rest of the group", () => {
    const s = resolveSettings([{ key: "pricing", value: { basePricePaise: 59_900 } }]);
    expect(s.pricing.basePricePaise).toBe(59_900);
    expect(s.pricing.gstRatePercent).toBe(DEFAULT_SETTINGS.pricing.gstRatePercent);
  });

  it("keeps a closed day closed", () => {
    const weeklyHours = { ...DEFAULT_SETTINGS.schedule.weeklyHours, mon: null };
    const s = resolveSettings([{ key: "schedule", value: { weeklyHours } }]);
    expect(s.schedule.weeklyHours.mon).toBeNull();
  });

  it("rejects closing before opening", () => {
    const weeklyHours = { ...DEFAULT_SETTINGS.schedule.weeklyHours, tue: { opensAt: "22:00", closesAt: "10:00" } };
    expect(() => resolveSettings([{ key: "schedule", value: { weeklyHours } }])).toThrow(InvalidSettingsError);
  });

  it("rejects a drive longer than its slot", () => {
    expect(() => resolveSettings([{ key: "schedule", value: { driveMinutes: 20, slotMinutes: 15 } }])).toThrow(
      /Drive time can't be longer than the slot/,
    );
  });

  it("names the broken group when stored data is invalid", () => {
    try {
      resolveSettings([{ key: "policy", value: { maxSeatsPerBooking: 0 } }]);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidSettingsError);
      expect((e as InvalidSettingsError).key).toBe("policy");
    }
  });

  it("ignores stored values that aren't objects", () => {
    expect(resolveSettings([{ key: "venue", value: "garbage" }]).venue).toEqual(DEFAULT_SETTINGS.venue);
  });
});
