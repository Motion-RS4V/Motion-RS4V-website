/** "₹499", or "₹499.50" when there are paise. */
export function formatRupees(paise: number): string {
  const rupees = paise / 100;
  const whole = Number.isInteger(rupees);
  return `₹${rupees.toLocaleString("en-IN", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
