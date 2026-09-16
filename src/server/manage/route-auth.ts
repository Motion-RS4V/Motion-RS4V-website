import { db } from "@/server/db";
import { jsonError } from "@/server/http";
import { resolveManageToken } from "./tokens";

/** Resolves the manage link in a route's URL to a booking id, or a ready 404 response. */
export async function bookingFromToken(params: Promise<{ token: string }>): Promise<{ bookingId: string } | { response: Response }> {
  const { token } = await params;
  const bookingId = await resolveManageToken(db, token);
  if (!bookingId) return { response: jsonError(404, "This link has expired or isn't valid. Use Find My Booking to get a new one.") };
  return { bookingId };
}
