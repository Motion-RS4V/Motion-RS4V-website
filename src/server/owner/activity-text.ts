import type { ActivityEntry } from "./activity";

const STATUS_WORDS: Record<string, string> = {
  READY: "Ready",
  ACTIVE: "Working",
  MAINTENANCE: "Under repair",
  RETIRED: "Retired",
};
const SETTINGS_WORDS: Record<string, string> = {
  pricing: "prices",
  schedule: "opening hours",
  policy: "booking rules",
  eligibility: "who can drive",
  venue: "venue details",
};

type Json = Record<string, unknown> | null;
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const str = (v: unknown) => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v));

/** Top-level fields that differ between two JSON objects, for "changed free cancellation window" style summaries. */
export function changedFields(before: unknown, after: unknown): string[] {
  const a = obj(before) ?? {};
  const b = obj(after) ?? {};
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}

function words(field: string): string {
  return field.replace(/Paise$/, "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

/** One plain sentence per audit entry. Unknown actions fall back to their raw name, so nothing is hidden. */
export function describeActivity(e: Pick<ActivityEntry, "action" | "entityId" | "before" | "after" | "bookingReference">): string {
  const after = obj(e.after);
  const before = obj(e.before);
  const ref = e.bookingReference ?? "a booking";

  switch (e.action) {
    case "settings.update": {
      const fields = changedFields(e.before, e.after);
      const what = SETTINGS_WORDS[e.entityId] ?? e.entityId;
      return fields.length ? `Changed ${what}: ${fields.map(words).join(", ")}` : `Saved ${what} (no changes)`;
    }
    case "schedule.override_save":
      return after?.closed ? `Closed the venue on ${e.entityId}` : `Set special hours on ${e.entityId}: ${str(after?.opensAt)}–${str(after?.closesAt)}`;
    case "schedule.override_remove":
      return `Put ${e.entityId} back on the weekly hours`;
    case "staff.add":
      return `Added ${str(after?.name)} (${str(after?.role).toLowerCase()})`;
    case "staff.update": {
      const fields = changedFields(e.before, e.after);
      if (fields.includes("active")) return `${after?.active ? "Turned on" : "Turned off"} ${str(after?.name)}'s account`;
      if (fields.includes("role")) return `Changed ${str(after?.name)} from ${str(before?.role).toLowerCase()} to ${str(after?.role).toLowerCase()}`;
      return `Updated ${str(after?.name)}'s account`;
    }
    case "staff.reset_link":
      return "Created a password link for a team member";
    case "customers.export":
      return `Exported ${str(after?.rows)} customers${e.entityId === "consent" ? " (marketing list)" : ""}`;
    case "car.status":
    case "rig.status":
      return `Marked ${str(after?.label)} ${STATUS_WORDS[str(after?.status)] ?? str(after?.status)}`;
    case "car.create":
    case "rig.create":
      return `Added ${e.action.startsWith("car") ? "car" : "rig"} ${str(after?.label)}`;
    case "car.update":
    case "rig.update":
      return `Renamed or edited ${str(after?.label)}`;
    case "rig.reorder":
      return "Changed the rig order";
    case "block.create":
      return `Blocked sessions: ${str(after?.reason)}`;
    case "block.lift":
      return "Lifted a block";
    case "booking.create":
      return `Created booking ${ref}`;
    case "booking.walk_in":
      return `Sold walk-in ${ref}`;
    case "booking.paid":
      return `Payment confirmed for ${ref}`;
    case "booking.cancel":
      return `Cancelled ${ref}`;
    case "booking.cancel_seats":
      return `Removed drivers from ${ref}`;
    case "booking.reschedule":
      return `Moved ${ref}`;
    case "booking.check_in":
      return `Checked in ${ref}`;
    case "booking.no_show":
      return `Marked no-show on ${ref}`;
    case "seat.reassign":
      return `Changed rig or car on ${ref}`;
    case "refund.counter_paid":
      return `Handed over a desk refund for ${ref}`;
    case "refund.failed":
      return `A refund failed for ${ref}`;
    case "refund.retry":
      return `Retried a refund for ${ref}`;
    default:
      return e.action;
  }
}
