import type { NextRequest } from "next/server";
import { z } from "zod";
import { previewCancellation } from "@/server/booking";
import { db } from "@/server/db";
import { handleRouteError, jsonOk, readJson } from "@/server/http";
import { bookingFromToken } from "@/server/manage/route-auth";
import { customerCancel } from "@/server/manage/service";
import { paymentGateway } from "@/server/payments";

const seatIds = z.array(z.uuid()).min(1).max(12).optional();

/** Preview: what cancelling these drivers (or everyone) would refund right now. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/manage/[token]/cancel">) {
  const auth = await bookingFromToken(ctx.params);
  if ("response" in auth) return auth.response;
  const raw = request.nextUrl.searchParams.get("seats");
  const parsed = seatIds.safeParse(raw ? raw.split(",") : undefined);
  if (!parsed.success) return jsonOk({ allowed: false, refundPaise: 0, reason: "INVALID_SEATS" });
  try {
    return jsonOk(await previewCancellation(db, { bookingId: auth.bookingId, seatIds: parsed.data, actor: { kind: "customer" } }));
  } catch (error) {
    return handleRouteError(error, "cancel preview");
  }
}

/** Cancels the chosen drivers (or the whole booking) and refunds what the policy allows. */
export async function POST(request: Request, ctx: RouteContext<"/api/manage/[token]/cancel">) {
  const auth = await bookingFromToken(ctx.params);
  if ("response" in auth) return auth.response;
  const parsed = await readJson(request, z.object({ seatIds }));
  if (!parsed.ok) return parsed.response;
  try {
    return jsonOk(await customerCancel(db, paymentGateway(), { bookingId: auth.bookingId, seatIds: parsed.data.seatIds }));
  } catch (error) {
    return handleRouteError(error, "customer cancel");
  }
}
