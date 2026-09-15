/**
 * Normalises a phone number to E.164 so the same customer is recognised however they type it.
 * Bare 10-digit numbers are treated as Indian mobiles. Returns null when the number isn't usable.
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");

  if (trimmed.startsWith("+")) {
    if (digits.startsWith("91")) return indianMobile(digits.slice(2));
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 10) return indianMobile(digits);
  if (digits.length === 11 && digits.startsWith("0")) return indianMobile(digits.slice(1));
  if (digits.length === 12 && digits.startsWith("91")) return indianMobile(digits.slice(2));
  return null;
}

function indianMobile(tenDigits: string): string | null {
  return /^[6-9]\d{9}$/.test(tenDigits) ? `+91${tenDigits}` : null;
}
