import { after } from "next/server";
import { z } from "zod";
import { db } from "@/server/db";
import { paymentsEnv } from "@/server/env";
import { handleRouteError, jsonError, jsonOk, readJson } from "@/server/http";
import { CheckoutError, finalizePayment, paymentGateway, verifyCheckoutSignature } from "@/server/payments";

const bodySchema = z.object({
  orderId: z.string().regex(/^order_[A-Za-z0-9]+$/),
  paymentId: z.string().regex(/^pay_[A-Za-z0-9]+$/),
  signature: z.string().min(10).max(200),
});

/** Called by the browser when Razorpay Checkout reports success. The signature proves the result came from Razorpay. */
export async function POST(request: Request) {
  const parsed = await readJson(request, bodySchema);
  if (!parsed.ok) return parsed.response;
  const { orderId, paymentId, signature } = parsed.data;

  if (!verifyCheckoutSignature(orderId, paymentId, signature, paymentsEnv().RAZORPAY_KEY_SECRET)) {
    return jsonError(400, "We couldn't verify this payment. If money left your account, it will be refunded automatically.");
  }

  try {
    // Emails go out after the response: the customer shouldn't wait on our mail provider.
    const result = await finalizePayment(db, paymentGateway(), { orderId, paymentId }, { schedule: (task) => after(task) });
    if (result.outcome === "CONFIRMED" || result.outcome === "ALREADY_CONFIRMED") {
      return jsonOk({ outcome: "CONFIRMED", reference: result.reference, managePath: `/manage/${result.token}?welcome=1` });
    }
    return jsonOk(result);
  } catch (error) {
    if (error instanceof CheckoutError) return jsonError(400, error.message, { code: error.code });
    return handleRouteError(error, "payment verification");
  }
}
