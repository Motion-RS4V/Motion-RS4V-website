import { z } from "zod";
import { cancelBooking, previewCancellation } from "@/server/booking";
import { db } from "@/server/db";
import { handleRouteError, jsonError, jsonOk, readJson } from "@/server/http";
import { markRefundPaid, paymentGateway, refundBooking, retryRefund } from "@/server/payments";
import { staffApiSession } from "@/server/staff/session";
import {
  checkInBooking,
  createBlock,
  createWalkIn,
  liftBlock,
  markNoShow,
  reassignSeat,
  setCarStatus,
  setRigStatus,
} from "@/server/staff/operations";

const uuid = z.uuid();

/** One endpoint for every desk action, so the console has a single place to post to. */
const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("check-in"),
    bookingId: uuid,
    seatIds: z.array(uuid).min(1).max(12).optional(),
    overrides: z.array(z.object({ seatId: uuid, rigId: uuid.nullable().optional(), carId: uuid.nullable().optional() })).max(12).optional(),
  }),
  z.object({ action: z.literal("reassign"), seatId: uuid, rigId: uuid.nullable().optional(), carId: uuid.nullable().optional() }),
  z.object({ action: z.literal("no-show"), bookingId: uuid, seatIds: z.array(uuid).min(1).max(12).optional() }),
  z.object({
    action: z.literal("walk-in"),
    start: z.iso.datetime(),
    seats: z.array(z.object({ experienceCode: z.string().min(1).max(40), driverName: z.string().trim().max(60).nullish() })).min(1).max(12),
    customer: z.object({ name: z.string().trim().min(1).max(80), phone: z.string().trim().min(6).max(20), email: z.email().max(120).optional().or(z.literal("")) }),
    paymentMethod: z.enum(["CASH", "UPI_COUNTER", "CARD_COUNTER", "COMPLIMENTARY"]),
  }),
  z.object({
    action: z.literal("cancel"),
    bookingId: uuid,
    reason: z.string().trim().max(200).optional(),
    /** CUSTOMER: the normal policy applies. VENUE: we can't run the session, so the customer gets everything back. */
    cause: z.enum(["CUSTOMER", "VENUE"]).default("CUSTOMER"),
  }),
  z.object({ action: z.literal("car-status"), carId: uuid, status: z.enum(["READY", "MAINTENANCE", "RETIRED"]) }),
  z.object({ action: z.literal("rig-status"), rigId: uuid, status: z.enum(["ACTIVE", "MAINTENANCE", "RETIRED"]) }),
  z.object({ action: z.literal("block"), start: z.iso.datetime(), end: z.iso.datetime(), rigId: uuid.nullable().optional(), reason: z.string().trim().min(3).max(200) }),
  z.object({ action: z.literal("lift-block"), blockId: uuid }),
  z.object({ action: z.literal("refund-paid"), refundId: uuid }),
  z.object({ action: z.literal("refund-retry"), refundId: uuid }),
]);

export async function POST(request: Request) {
  const auth = await staffApiSession();
  if ("response" in auth) return auth.response;
  const actorId = auth.session.id;

  const parsed = await readJson(request, bodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  try {
    switch (body.action) {
      case "check-in":
        return jsonOk(await checkInBooking(db, { bookingId: body.bookingId, seatIds: body.seatIds, overrides: body.overrides, actorId }));

      case "reassign":
        return jsonOk(await reassignSeat(db, { seatId: body.seatId, rigId: body.rigId, carId: body.carId, actorId }));

      case "no-show":
        return jsonOk(await markNoShow(db, { bookingId: body.bookingId, seatIds: body.seatIds, actorId }));

      case "walk-in": {
        const booking = await createWalkIn(db, {
          slotStart: new Date(body.start),
          seats: body.seats.map((s) => ({ experienceCode: s.experienceCode, driverName: s.driverName ?? null })),
          customer: { name: body.customer.name, phone: body.customer.phone, email: body.customer.email || null },
          payment: { method: body.paymentMethod },
          actorId,
        });
        return jsonOk({ bookingId: booking.id, reference: booking.reference, totalPaise: booking.totalPaise });
      }

      case "cancel": {
        // Customer's request → the normal policy. Venue can't run it → full refund, however late it is.
        const actor = body.cause === "VENUE" ? ({ kind: "venue", staffId: actorId } as const) : ({ kind: "staff", staffId: actorId } as const);
        const why = body.reason ?? (body.cause === "VENUE" ? "Venue cancelled the session" : "Cancelled at the desk");
        const quote = await previewCancellation(db, { bookingId: body.bookingId, actor });
        const result = await cancelBooking(db, { bookingId: body.bookingId, actor, reason: why });
        const refund =
          result.refundDuePaise > 0
            ? await refundBooking(db, paymentGateway(), { bookingId: body.bookingId, amountPaise: result.refundDuePaise, reason: why, actorId })
            : null;
        return jsonOk({ ...result, quotedReason: quote.reason, refundedPaise: refund?.refundedPaise ?? 0, refundFailedPaise: refund?.failedPaise ?? 0 });
      }

      case "car-status":
        return jsonOk(await setCarStatus(db, { carId: body.carId, status: body.status, actorId }));

      case "rig-status":
        return jsonOk(await setRigStatus(db, { rigId: body.rigId, status: body.status, actorId }));

      case "block": {
        const start = new Date(body.start);
        const end = new Date(body.end);
        if (end <= start) return jsonError(400, "The block must end after it starts.");
        return jsonOk(await createBlock(db, { startsAt: start, endsAt: end, rigId: body.rigId ?? null, reason: body.reason, actorId }));
      }

      case "lift-block":
        return jsonOk(await liftBlock(db, { blockId: body.blockId, actorId }));

      case "refund-paid":
        return jsonOk(await markRefundPaid(db, { refundId: body.refundId, actorId }));

      case "refund-retry":
        return jsonOk(await retryRefund(db, paymentGateway(), { refundId: body.refundId, actorId }));
    }
  } catch (error) {
    return handleRouteError(error, `staff ${body.action}`);
  }
}
