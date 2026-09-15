import { describe, expect, it } from "vitest";
import { normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it.each([
    ["98765 43210", "+919876543210"],
    ["+91 98765-43210", "+919876543210"],
    ["09876543210", "+919876543210"],
    ["919876543210", "+919876543210"],
    ["(987) 654 3210", "+919876543210"],
  ])("recognises %s as the same Indian mobile", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it("keeps international numbers", () => {
    expect(normalizePhone("+44 7700 900123")).toBe("+447700900123");
  });

  it.each(["12345", "5876543210", "+91 12345 67890", "", "call me"])("rejects %j", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});
