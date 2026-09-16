import type { StrandedBooking } from "./schedule-change";

/** A refused owner action with a message that can be shown as-is. */
export class OwnerError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "OwnerError";
  }
}

/** The change would leave upcoming bookings off the slot grid. Nothing was saved. */
export class ScheduleConflictError extends Error {
  constructor(readonly stranded: StrandedBooking[]) {
    super(`${stranded.length} upcoming booking(s) don't fit the new schedule`);
    this.name = "ScheduleConflictError";
  }
}

/** Prisma's unique-constraint failure, without importing the runtime error class into every module. */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}
