import type { NextRequest } from "next/server";
import { BookingError, getDayAvailability } from "@/server/booking";
import { db } from "@/server/db";
import { toPublicDay } from "@/server/site/content";

/** Live sessions for one venue-local date: GET /api/availability?date=2026-09-19 */
export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: "Pass a date as ?date=YYYY-MM-DD" }, { status: 400 });
  }

  try {
    const day = await getDayAvailability(db, date, { channel: "ONLINE" });
    return Response.json(toPublicDay(day), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof BookingError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error("availability lookup failed", error);
    return Response.json({ error: "Sessions couldn't be loaded. Try again in a moment." }, { status: 500 });
  }
}
