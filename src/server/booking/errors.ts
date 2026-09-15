export type BookingErrorCode =
  | "INVALID_PHONE"
  | "MISSING_NAME"
  | "NO_SEATS"
  | "TOO_MANY_SEATS"
  | "UNKNOWN_EXPERIENCE"
  | "SLOT_NOT_FOUND"
  | "SLOT_IN_PAST"
  | "ONLINE_BOOKING_CLOSED"
  | "OUTSIDE_BOOKING_WINDOW"
  | "SLOT_FULL"
  | "EXPERIENCE_FULL"
  | "BOOKING_NOT_FOUND"
  | "INVALID_STATE"
  | "CANCEL_NOT_ALLOWED"
  | "RESCHEDULE_NOT_ALLOWED";

/** Customer-safe messages. The UI may show these as-is. */
const MESSAGES: Record<BookingErrorCode, string> = {
  INVALID_PHONE: "Enter a valid mobile number.",
  MISSING_NAME: "Enter the name the booking is under.",
  NO_SEATS: "Choose at least one seat.",
  TOO_MANY_SEATS: "That's more seats than one booking can hold.",
  UNKNOWN_EXPERIENCE: "That experience isn't available.",
  SLOT_NOT_FOUND: "That session time doesn't exist. Pick a time from the list.",
  SLOT_IN_PAST: "That session has already started.",
  ONLINE_BOOKING_CLOSED: "Online booking for this session has closed. Ask at the desk for a walk-in seat.",
  OUTSIDE_BOOKING_WINDOW: "Sessions that far ahead aren't open for booking yet.",
  SLOT_FULL: "Not enough seats left in this session.",
  EXPERIENCE_FULL: "Not enough seats left for that track in this session.",
  BOOKING_NOT_FOUND: "We couldn't find that booking.",
  INVALID_STATE: "This booking can't be changed right now.",
  CANCEL_NOT_ALLOWED: "This booking can no longer be cancelled.",
  RESCHEDULE_NOT_ALLOWED: "This booking can no longer be moved.",
};

export class BookingError extends Error {
  constructor(
    readonly code: BookingErrorCode,
    readonly details: Record<string, unknown> = {},
  ) {
    super(MESSAGES[code]);
    this.name = "BookingError";
  }
}
