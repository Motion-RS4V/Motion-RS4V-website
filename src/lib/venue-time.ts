/** Browser-safe venue clock helpers. The server's booking engine has its own, fuller set. */

export type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type DayHours = { opensAt: string; closesAt: string } | null;
export type WeeklyHours = Record<WeekdayKey, DayHours>;

const KEYS: WeekdayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
// Fixed labels: browsers' locale data disagrees on short months ("Sep" vs "Sept").
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function venueNow(tz: string, now = new Date()): { date: string; time: string; day: WeekdayKey } {
  const parts: Record<string, string> = {};
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  for (const p of fmt.formatToParts(now)) parts[p.type] = p.value;
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return { date, time: `${parts.hour}:${parts.minute}`, day: weekdayOf(date) };
}

export function weekdayOf(date: string): WeekdayKey {
  const [y, m, d] = date.split("-").map(Number);
  return KEYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** "Tue 15 Sep" */
export function shortDate(date: string): { weekday: string; day: string; month: string; label: string } {
  const [y, m, d] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const weekday = WEEKDAY_LABELS[utc.getUTCDay()];
  const month = MONTH_LABELS[utc.getUTCMonth()];
  return { weekday, day: String(d), month, label: `${weekday} ${d} ${month}` };
}

export type OpenState = { open: boolean; label: string };

/** Uses the weekly hours. Holiday overrides are reflected in the session list, which comes from the server. */
export function openState(hours: WeeklyHours, tz: string, now = new Date()): OpenState {
  const local = venueNow(tz, now);
  const today = hours[local.day];
  if (today && local.time >= today.opensAt && local.time < today.closesAt) {
    return { open: true, label: `Open now · until ${today.closesAt}` };
  }
  if (today && local.time < today.opensAt) return { open: false, label: `Closed now · opens ${today.opensAt}` };
  for (let i = 1; i <= 7; i++) {
    const next = hours[weekdayOf(addDays(local.date, i))];
    if (next) return { open: false, label: `Closed now · opens ${i === 1 ? "tomorrow" : shortDate(addDays(local.date, i)).weekday} ${next.opensAt}` };
  }
  return { open: false, label: "Closed" };
}

/** "10:00 – 22:00, every day" or null when days differ. */
export function uniformHours(hours: WeeklyHours): string | null {
  const values = Object.values(hours);
  const first = values[0];
  if (!first || values.some((h) => !h || h.opensAt !== first.opensAt || h.closesAt !== first.closesAt)) return null;
  return `${first.opensAt} – ${first.closesAt}`;
}
