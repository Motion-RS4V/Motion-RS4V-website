import type { PrismaClient } from "@/generated/prisma/client";
import { cancelBooking, confirmHeldBooking, createBooking, type CreateBookingInput } from "@/server/booking";
import type { EmailProvider } from "@/server/email/providers";
import { createManageToken } from "@/server/manage/tokens";
import { emailBookingConfirmed, emailUnavailableRefunded } from "./notifications";
import type { PaymentGateway, RazorpayPayment } from "./razorpay";
import { refundBooking } from "./refunds";

export class CheckoutError extends Error {
  constructor(
    readonly code: "PAYMENT_UNAVAILABLE" | "ORDER_NOT_FOUND" | "PAYMENT_MISMATCH" | "PAYMENT_NOT_COMPLETED",
    message: string,
  ) {
    super(message);
    this.name = "CheckoutError";
  }
}

export type StartedCheckout = {
  bookingId: string;
  reference: string;
  orderId: string;
  amountPaise: number;
  currency: "INR";
  keyId: string;
  holdExpiresAt: string;
};

/**
 * Holds the seats (PENDING_PAYMENT) and opens a Razorpay order for the server-computed total.
 * If Razorpay can't create the order, the hold is released straight away.
 */
export async function startCheckout(
  db: PrismaClient,
  gateway: PaymentGateway,
  input: Omit<CreateBookingInput, "channel" | "staffId">,
): Promise<StartedCheckout> {
  const booking = await createBooking(db, { ...input, channel: "ONLINE", staffId: null });

  let order;
  try {
    order = await gateway.createOrder({
      amountPaise: booking.totalPaise,
      receipt: booking.reference,
      notes: { booking_id: booking.id, reference: booking.reference },
    });
  } catch (error) {
    console.error("razorpay order creation failed", booking.reference, error);
    await cancelBooking(db, { bookingId: booking.id, actor: { kind: "customer" }, reason: "Payment order could not be created" }).catch(() => {});
    throw new CheckoutError("PAYMENT_UNAVAILABLE", "Online payment isn't available right now. Your seats weren't held. Please try again in a moment.");
  }

  await db.payment.create({
    data: { bookingId: booking.id, method: "RAZORPAY", status: "CREATED", amountPaise: booking.totalPaise, razorpayOrderId: order.id },
  });

  return {
    bookingId: booking.id,
    reference: booking.reference,
    orderId: order.id,
    amountPaise: booking.totalPaise,
    currency: "INR",
    keyId: gateway.keyId,
    holdExpiresAt: booking.holdExpiresAt!.toISOString(),
  };
}

export type FinalizeResult =
  | { outcome: "CONFIRMED" | "ALREADY_CONFIRMED"; reference: string; token: string }
  | { outcome: "REFUNDED_UNAVAILABLE"; reference: string; refundedPaise: number }
  | { outcome: "PAYMENT_FAILED"; reference: string; message: string }
  | { outcome: "PENDING"; reference: string };

/**
 * Turns a Razorpay payment into a confirmed booking. Called from the browser callback (after signature checks)
 * and from the webhook, possibly both at once, so every step is idempotent.
 * The payment is always re-fetched from Razorpay: nothing about amount or status is taken from the caller.
 */
export type FinalizeOptions = {
  emailProvider?: EmailProvider;
  /** Where to run work the customer doesn't wait for (emails). Defaults to awaiting it inline. */
  schedule?: (task: () => Promise<void>) => void;
};

export async function finalizePayment(
  db: PrismaClient,
  gateway: PaymentGateway,
  input: { orderId: string; paymentId: string; now?: Date },
  options: FinalizeOptions = {},
): Promise<FinalizeResult> {
  const emailProviderOverride = options.emailProvider;
  const pending: Promise<unknown>[] = [];
  const schedule = options.schedule ?? ((task: () => Promise<void>) => void pending.push(task()));
  const now = input.now ?? new Date();
  const row = await db.payment.findUnique({
    where: { razorpayOrderId: input.orderId },
    select: { id: true, bookingId: true, amountPaise: true, status: true, razorpayPaymentId: true, booking: { select: { reference: true, slotEnd: true } } },
  });
  if (!row) throw new CheckoutError("ORDER_NOT_FOUND", "We couldn't match this payment to a booking.");
  const reference = row.booking.reference;

  let payment: RazorpayPayment = await gateway.fetchPayment(input.paymentId);
  if (payment.order_id !== input.orderId || payment.amount !== row.amountPaise || payment.currency !== "INR") {
    console.error("payment mismatch", { orderId: input.orderId, paymentId: input.paymentId, got: { order: payment.order_id, amount: payment.amount } });
    throw new CheckoutError("PAYMENT_MISMATCH", "This payment doesn't match the booking.");
  }

  if (payment.status === "authorized") payment = await gateway.capturePayment(payment.id, row.amountPaise);

  if (payment.status === "failed") {
    if (row.status === "CREATED") await db.payment.update({ where: { id: row.id }, data: { status: "FAILED", razorpayPaymentId: payment.id } });
    return { outcome: "PAYMENT_FAILED", reference, message: payment.error_description ?? "The payment didn't go through." };
  }
  if (payment.status === "refunded") {
    // Already refunded (e.g. by an earlier finalize). Never confirm a booking on money that went back.
    return { outcome: "REFUNDED_UNAVAILABLE", reference, refundedPaise: payment.amount_refunded ?? payment.amount };
  }
  if (payment.status !== "captured") return { outcome: "PENDING", reference };

  if (row.status === "CREATED" || row.status === "AUTHORIZED" || row.status === "FAILED") {
    await db.payment.updateMany({
      where: { id: row.id, status: { in: ["CREATED", "AUTHORIZED", "FAILED"] } },
      data: { status: "CAPTURED", razorpayPaymentId: payment.id, capturedAt: now, providerPayload: payment as never },
    });
  }

  const confirmation = await confirmHeldBooking(db, { bookingId: row.bookingId, now });

  if (confirmation.outcome === "CONFIRMED" || confirmation.outcome === "ALREADY_CONFIRMED") {
    const token = await createManageToken(db, { id: row.bookingId, slotEnd: confirmation.booking.slotEnd });
    if (confirmation.outcome === "CONFIRMED") {
      await db.auditLog.create({
        data: { actorId: null, action: "booking.paid", entityType: "booking", entityId: row.bookingId, after: { paymentId: payment.id, amountPaise: row.amountPaise } },
      });
      schedule(() => emailBookingConfirmed(db, row.bookingId, token, emailProviderOverride).then(() => undefined));
    }
    await Promise.all(pending);
    return { outcome: confirmation.outcome, reference, token };
  }

  // Seats went while the customer was paying (or the booking was cancelled): give the money back in full.
  const refund = await refundBooking(db, gateway, {
    bookingId: row.bookingId,
    amountPaise: row.amountPaise,
    reason: "Seats no longer available when payment arrived",
    actorId: null,
  });
  if (refund.refundedPaise > 0) {
    schedule(() => emailUnavailableRefunded(db, row.bookingId, refund.refundedPaise, emailProviderOverride).then(() => undefined));
  }
  await Promise.all(pending);
  return { outcome: "REFUNDED_UNAVAILABLE", reference, refundedPaise: refund.refundedPaise };
}

/** The customer closed checkout without paying: release their seats now instead of waiting for the hold to lapse. */
export async function releaseCheckout(db: PrismaClient, orderId: string): Promise<boolean> {
  const row = await db.payment.findUnique({ where: { razorpayOrderId: orderId }, select: { status: true, bookingId: true, booking: { select: { status: true } } } });
  if (!row || row.booking.status !== "PENDING_PAYMENT" || !["CREATED", "FAILED"].includes(row.status)) return false;
  await cancelBooking(db, { bookingId: row.bookingId, actor: { kind: "customer" }, reason: "Checkout closed without payment" });
  return true;
}
