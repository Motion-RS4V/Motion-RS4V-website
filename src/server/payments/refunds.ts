import type { PrismaClient } from "@/generated/prisma/client";
import type { PaymentGateway } from "./razorpay";

export type RefundOutcome = {
  requestedPaise: number;
  /** Sent back through Razorpay. */
  refundedPaise: number;
  /** Money taken at the desk: recorded as a pending refund for staff to hand over in cash. */
  counterDuePaise: number;
  failedPaise: number;
  refundIds: string[];
};

const COUNTER_METHODS = ["CASH", "UPI_COUNTER", "CARD_COUNTER"] as const;

/**
 * Refunds up to `amountPaise` across a booking's captured Razorpay payments.
 * Each payment is locked while its refund row is created, so two requests (say the checkout callback and the webhook)
 * can never refund the same money twice. The provider call happens after the row exists; a failure marks it FAILED.
 */
export async function refundBooking(
  db: PrismaClient,
  gateway: PaymentGateway,
  input: { bookingId: string; amountPaise: number; reason: string; actorId: string | null },
): Promise<RefundOutcome> {
  const outcome: RefundOutcome = { requestedPaise: input.amountPaise, refundedPaise: 0, counterDuePaise: 0, failedPaise: 0, refundIds: [] };
  let remaining = input.amountPaise;
  if (remaining <= 0) return outcome;

  const payments = await db.payment.findMany({
    where: { bookingId: input.bookingId, method: "RAZORPAY", status: { in: ["CAPTURED", "PARTIALLY_REFUNDED"] }, razorpayPaymentId: { not: null } },
    orderBy: { capturedAt: "asc" },
    select: { id: true },
  });

  for (const { id: paymentId } of payments) {
    if (remaining <= 0) break;

    const claim = await db.$transaction(async (tx) => {
      await tx.$queryRaw`select id from payments where id = ${paymentId}::uuid for update`;
      const payment = await tx.payment.findUniqueOrThrow({
        where: { id: paymentId },
        select: { amountPaise: true, razorpayPaymentId: true, refunds: { where: { status: { not: "FAILED" } }, select: { amountPaise: true } } },
      });
      const refundable = payment.amountPaise - payment.refunds.reduce((sum, r) => sum + r.amountPaise, 0);
      const amount = Math.min(refundable, remaining);
      if (amount <= 0) return null;
      const refund = await tx.refund.create({
        data: { paymentId, amountPaise: amount, status: "PENDING", reason: input.reason, createdById: input.actorId },
        select: { id: true },
      });
      return { refundId: refund.id, amount, razorpayPaymentId: payment.razorpayPaymentId! };
    });
    if (!claim) continue;
    remaining -= claim.amount;

    try {
      const result = await gateway.refundPayment(claim.razorpayPaymentId, {
        amountPaise: claim.amount,
        notes: { booking_id: input.bookingId, reason: input.reason.slice(0, 200) },
      });
      await db.refund.update({
        where: { id: claim.refundId },
        data: {
          razorpayRefundId: result.id,
          status: result.status === "processed" ? "PROCESSED" : result.status === "failed" ? "FAILED" : "PENDING",
          processedAt: result.status === "processed" ? new Date() : null,
        },
      });
      if (result.status === "failed") outcome.failedPaise += claim.amount;
      else outcome.refundedPaise += claim.amount;
      outcome.refundIds.push(claim.refundId);
    } catch (error) {
      await db.refund.update({ where: { id: claim.refundId }, data: { status: "FAILED" } });
      await db.auditLog.create({
        data: {
          actorId: input.actorId,
          action: "refund.failed",
          entityType: "booking",
          entityId: input.bookingId,
          after: { refundId: claim.refundId, amountPaise: claim.amount, error: error instanceof Error ? error.message : String(error) },
        },
      });
      console.error("refund failed", claim.refundId, error);
      outcome.failedPaise += claim.amount;
    }
    await syncPaymentRefundStatus(db, paymentId);
  }

  // Anything paid at the desk can't be refunded by us: record it so staff know to hand the money back.
  for (const payment of await db.payment.findMany({
    where: { bookingId: input.bookingId, method: { in: [...COUNTER_METHODS] }, status: { in: ["CAPTURED", "PARTIALLY_REFUNDED"] } },
    orderBy: { capturedAt: "asc" },
    select: { id: true },
  })) {
    if (remaining <= 0) break;
    const claimed = await db.$transaction(async (tx) => {
      await tx.$queryRaw`select id from payments where id = ${payment.id}::uuid for update`;
      const row = await tx.payment.findUniqueOrThrow({
        where: { id: payment.id },
        select: { amountPaise: true, refunds: { where: { status: { not: "FAILED" } }, select: { amountPaise: true } } },
      });
      const refundable = row.amountPaise - row.refunds.reduce((sum, r) => sum + r.amountPaise, 0);
      const amount = Math.min(refundable, remaining);
      if (amount <= 0) return null;
      const refund = await tx.refund.create({
        data: { paymentId: payment.id, amountPaise: amount, status: "PENDING", reason: `${input.reason} (refund at the desk)`, createdById: input.actorId },
        select: { id: true },
      });
      return { refundId: refund.id, amount };
    });
    if (!claimed) continue;
    remaining -= claimed.amount;
    outcome.counterDuePaise += claimed.amount;
    outcome.refundIds.push(claimed.refundId);
    await syncPaymentRefundStatus(db, payment.id);
  }

  return outcome;
}

/** Staff confirming they handed cash back at the desk. */
export async function markRefundPaid(db: PrismaClient, input: { refundId: string; actorId: string }) {
  const refund = await db.refund.findUniqueOrThrow({
    where: { id: input.refundId },
    select: { id: true, status: true, amountPaise: true, payment: { select: { bookingId: true, method: true } } },
  });
  if (refund.status === "PROCESSED") return refund;
  const updated = await db.refund.update({ where: { id: refund.id }, data: { status: "PROCESSED", processedAt: new Date() }, select: { id: true, amountPaise: true } });
  await db.auditLog.create({
    data: {
      actorId: input.actorId,
      action: "refund.counter_paid",
      entityType: "booking",
      entityId: refund.payment.bookingId,
      after: { refundId: refund.id, amountPaise: refund.amountPaise, method: refund.payment.method },
    },
  });
  return updated;
}

/** Tries a failed Razorpay refund again (a provider outage, say). */
export async function retryRefund(db: PrismaClient, gateway: PaymentGateway, input: { refundId: string; actorId: string }) {
  const refund = await db.refund.findUniqueOrThrow({
    where: { id: input.refundId },
    select: { id: true, status: true, amountPaise: true, reason: true, payment: { select: { id: true, bookingId: true, method: true, razorpayPaymentId: true } } },
  });
  if (refund.status !== "FAILED" || refund.payment.method !== "RAZORPAY" || !refund.payment.razorpayPaymentId) {
    throw new Error("Only a failed online refund can be retried.");
  }
  const result = await gateway.refundPayment(refund.payment.razorpayPaymentId, {
    amountPaise: refund.amountPaise,
    notes: { booking_id: refund.payment.bookingId, reason: refund.reason.slice(0, 200) },
  });
  const updated = await db.refund.update({
    where: { id: refund.id },
    data: {
      razorpayRefundId: result.id,
      status: result.status === "processed" ? "PROCESSED" : result.status === "failed" ? "FAILED" : "PENDING",
      processedAt: result.status === "processed" ? new Date() : null,
    },
    select: { id: true, status: true, amountPaise: true },
  });
  await db.auditLog.create({
    data: { actorId: input.actorId, action: "refund.retry", entityType: "booking", entityId: refund.payment.bookingId, after: { refundId: refund.id, status: updated.status } },
  });
  await syncPaymentRefundStatus(db, refund.payment.id);
  return updated;
}

/** Keeps a payment's status in line with its non-failed refunds. */
export async function syncPaymentRefundStatus(db: PrismaClient, paymentId: string) {
  const payment = await db.payment.findUniqueOrThrow({
    where: { id: paymentId },
    select: { amountPaise: true, status: true, refunds: { where: { status: { not: "FAILED" } }, select: { amountPaise: true } } },
  });
  if (!["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(payment.status)) return;
  const refunded = payment.refunds.reduce((sum, r) => sum + r.amountPaise, 0);
  const status = refunded <= 0 ? "CAPTURED" : refunded >= payment.amountPaise ? "REFUNDED" : "PARTIALLY_REFUNDED";
  if (status !== payment.status) await db.payment.update({ where: { id: paymentId }, data: { status } });
}
