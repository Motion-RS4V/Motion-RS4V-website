import { describe, expect, it } from "vitest";
import { changedFields, describeActivity } from "./activity-text";

const entry = (action: string, extra: Partial<Parameters<typeof describeActivity>[0]> = {}) => ({
  action,
  entityId: "x",
  before: null,
  after: null,
  bookingReference: null,
  ...extra,
});

describe("describeActivity", () => {
  it("names what changed in a settings group", () => {
    const text = describeActivity(
      entry("settings.update", { entityId: "policy", before: { freeCancelHours: 2, maxSeatsPerBooking: 4 }, after: { freeCancelHours: 6, maxSeatsPerBooking: 4 } }),
    );
    expect(text).toBe("Changed booking rules: free cancel hours");
  });

  it("describes staff access changes", () => {
    expect(describeActivity(entry("staff.update", { before: { name: "Asha", role: "STAFF", active: true }, after: { name: "Asha", role: "STAFF", active: false } }))).toBe(
      "Turned off Asha's account",
    );
    expect(describeActivity(entry("staff.update", { before: { name: "Asha", role: "STAFF", active: true }, after: { name: "Asha", role: "MANAGER", active: true } }))).toBe(
      "Changed Asha from staff to manager",
    );
  });

  it("uses the booking reference and falls back to the raw action", () => {
    expect(describeActivity(entry("booking.check_in", { bookingReference: "RS4V-7K2M9Q" }))).toBe("Checked in RS4V-7K2M9Q");
    expect(describeActivity(entry("something.new"))).toBe("something.new");
  });

  it("lists only fields whose values differ", () => {
    expect(changedFields({ a: 1, b: [1, 2] }, { a: 1, b: [1, 3], c: true })).toEqual(["b", "c"]);
  });
});
