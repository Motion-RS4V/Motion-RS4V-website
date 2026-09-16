import type { NextRequest } from "next/server";
import { db } from "@/server/db";
import { handleRouteError, jsonOk } from "@/server/http";
import { searchBookings } from "@/server/staff/board";
import { staffApiSession } from "@/server/staff/session";

/** Desk search by booking reference, mobile number or name. */
export async function GET(request: NextRequest) {
  const auth = await staffApiSession();
  if ("response" in auth) return auth.response;
  try {
    return jsonOk({ results: await searchBookings(db, request.nextUrl.searchParams.get("q") ?? "") });
  } catch (error) {
    return handleRouteError(error, "staff search");
  }
}
