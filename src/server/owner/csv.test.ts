import { describe, expect, it } from "vitest";
import { csvCell } from "./customers";

describe("csvCell", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('Asha "A", Raipur')).toBe('"Asha ""A"", Raipur"');
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell(null)).toBe("");
  });

  it("stops spreadsheet formulas in customer-supplied text", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("+919876500077")).toBe("+919876500077");
    expect(csvCell("+1+2")).toBe("\"'+1+2\"");
    expect(csvCell(42)).toBe("42");
  });
});
