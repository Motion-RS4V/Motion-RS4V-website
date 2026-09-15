import { randomInt } from "node:crypto";

// No 0/O, 1/I/L: references get read out over the phone and typed from a screenshot.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** A customer-facing booking reference, e.g. RS4V-7K2M9Q. */
export function newBookingReference(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return `RS4V-${code}`;
}

export function normalizeReference(input: string): string {
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return cleaned.startsWith("RS4V") ? `RS4V-${cleaned.slice(4)}` : `RS4V-${cleaned}`;
}
