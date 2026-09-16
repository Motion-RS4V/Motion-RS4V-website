import { z } from "zod";
import { db } from "@/server/db";
import { handleRouteError, jsonOk, readJson } from "@/server/http";
import { bookingFromToken } from "@/server/manage/route-auth";
import { customerReschedule } from "@/server/manage/service";

/** Moves every remaining driver to another session, if the policy still allows a move. */
export async function POST(request: Request, ctx: RouteContext<"/api/manage/[token]/reschedule">) {
  const auth = await bookingFromToken(ctx.params);
  if ("response" in auth) return auth.response;
  const parsed = await readJson(request, z.object({ start: z.iso.datetime({ error: "Pick a new session time." }) }));
  if (!parsed.ok) return parsed.response;
  try {
    const moved = await customerReschedule(db, { bookingId: auth.bookingId, newSlotStart: new Date(parsed.data.start) });
    return jsonOk({ slotStart: moved.slotStart.toISOString() });
  } catch (error) {
    return handleRouteError(error, "customer reschedule");
  }
}
