import { after } from "next/server";
import { db } from "@/server/db";
import { paymentsEnv } from "@/server/env";
import { CheckoutError, finalizePayment, paymentGateway, syncPaymentRefundStatus, verifyWebhookSignature } from "@/server/payments";

type Entity = Record<string, unknown> & { id?: string };
type WebhookBody = { event?: string; payload?: { payment?: { entity?: Entity }; refund?: { entity?: Entity } } };

/**
 * Razorpay → us. Backs up the browser callback (customers who close the tab right after paying)
 * and keeps refund statuses current. Every handler is idempotent because Razorpay retries deliveries.
 */
export async function POST(request: Request) {
  const secret = paymentsEnv().RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook secret not configured", { status: 503 });

  const raw = await request.text();
  if (!verifyWebhookSignature(raw, request.headers.get("x-razorpay-signature") ?? "", secret)) {
    return new Response("Invalid signature", { status: 401 });
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const payment = body.payload?.payment?.entity;
  const refund = body.payload?.refund?.entity;

  try {
    switch (body.event) {
      case "payment.captured":
      case "order.paid":
        if (typeof payment?.order_id === "string" && typeof payment.id === "string") {
          await finalizePayment(db, paymentGateway(), { orderId: payment.order_id, paymentId: payment.id }, { schedule: (task) => after(task) });
        }
        break;

      case "payment.failed":
        if (typeof payment?.order_id === "string") {
          await db.payment.updateMany({
            where: { razorpayOrderId: payment.order_id, status: "CREATED" },
            data: { status: "FAILED", razorpayPaymentId: typeof payment.id === "string" ? payment.id : undefined },
          });
        }
        break;

      case "refund.processed":
      case "refund.failed":
        if (typeof refund?.id === "string") {
          const row = await db.refund.findUnique({ where: { razorpayRefundId: refund.id }, select: { id: true, paymentId: true } });
          if (row) {
            const processed = body.event === "refund.processed";
            await db.refund.update({ where: { id: row.id }, data: { status: processed ? "PROCESSED" : "FAILED", processedAt: processed ? new Date() : null } });
            await syncPaymentRefundStatus(db, row.paymentId);
          }
        }
        break;
    }
  } catch (error) {
    // Orders from other apps on the same Razorpay account, or mismatches we've already logged: acknowledge, don't retry forever.
    if (error instanceof CheckoutError) return new Response("Ignored", { status: 200 });
    console.error("razorpay webhook failed", body.event, error);
    return new Response("Temporary failure", { status: 500 });
  }

  return new Response("OK", { status: 200 });
}
