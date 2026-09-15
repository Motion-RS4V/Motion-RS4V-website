/** wa.me link for a phone number in any format, or null when there isn't one. */
export function whatsappUrl(number: string): string | null {
  const digits = number.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}
